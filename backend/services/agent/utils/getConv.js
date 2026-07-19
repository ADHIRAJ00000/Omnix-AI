import { internalClient, asUser } from "./internalClient.js";
import { env } from "../config/env.js";

/**
 * Fetches a conversation's messages from the chat service.
 *
 * The user id is required, not optional: the chat service checks that the
 * conversation belongs to that user before returning anything, so a request
 * without it is rejected rather than silently returning another user's history.
 */
export const getConversationHistory = async (conversationId, userId, requestId) => {
  const response = await internalClient.get(
    `${env.CHAT_SERVICE}/get-messages/${conversationId}`,
    asUser(userId, requestId)
  );

  return response.data;
};
