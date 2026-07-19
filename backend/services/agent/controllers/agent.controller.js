import { graph } from "../graph/supervisor.graph.js";
import { addMessage, clearMemory } from "../utils/memory.js";
import { internalClient, asUser } from "../utils/internalClient.js";
import { env } from "../config/env.js";

/**
 * Runs the agent graph for one user turn.
 *
 * Ordering matters here. The graph is invoked first, and the user's message is
 * only persisted once we have a reply. Saving it up front meant a run rejected
 * for insufficient credits — or one that failed mid-way — still left the user's
 * message sitting in the conversation with no answer after it, so the next turn
 * replayed a question that was never actually answered.
 */
export const chat = async (req, res) => {
  const { prompt, conversationId, agent } = req.body;
  const userId = req.user.userId;

  req.log.info({ conversationId, agent, hasFile: Boolean(req.file) }, "agent run started");

  let result;
  try {
    result = await graph.invoke({
      prompt,
      conversationId,
      userId,
      agent,
      file: req.file,
      requestId: req.id,
    });
  } catch (error) {
    // The graph may have written the user's turn into the cached window before
    // failing. Dropping the cache forces the next read to rebuild from MongoDB,
    // which is the source of truth, rather than trusting a half-written window.
    await clearMemory(conversationId);
    throw error;
  }

  /**
   * Persisting both turns is what makes the conversation durable, so a failure
   * here must not be swallowed — but the answer has already been generated and
   * paid for, so we return it to the user either way rather than making them
   * pay again for a reply we are holding in memory.
   */
  try {
    await internalClient.post(
      `${env.CHAT_SERVICE}/save-message`,
      { conversationId, role: "user", content: prompt },
      asUser(userId, req.id)
    );

    await internalClient.post(
      `${env.CHAT_SERVICE}/save-message`,
      {
        conversationId,
        role: "assistant",
        content: result.response,
        images: result.images ?? [],
        artifacts: result.artifacts ?? [],
      },
      asUser(userId, req.id)
    );

    await addMessage(conversationId, "user", prompt);
    await addMessage(conversationId, "assistant", result.response);
  } catch (error) {
    await clearMemory(conversationId);
    req.log.error(
      { err: error, conversationId },
      "agent replied but the conversation could not be saved"
    );
  }

  req.log.info({ conversationId, agent }, "agent run completed");

  return res.json({
    success: true,
    answer: result.response,
    images: result.images ?? [],
    artifacts: result.artifacts ?? [],
  });
};
