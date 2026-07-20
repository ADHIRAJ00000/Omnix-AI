import { TavilySearch } from "@langchain/tavily";
import { env } from "../config/env.js";
import { AppError } from "../../../shared/errors/AppError.js";

/**
 * The web search tool, built on first use rather than at import.
 *
 * Building it at import time meant the constructor ran — and demanded a Tavily
 * key — the moment anything imported the graph. Since the graph imports every
 * agent, that made a search key a hard requirement for starting the service at
 * all, even for someone only using the chat agent.
 *
 * Deferring it means a missing key only affects search, and says so plainly
 * instead of failing at boot with a stack trace.
 */
let tool;

export const getSearchTool = () => {
  if (!env.TAVILY_API_KEY) {
    throw AppError.badRequest(
      "Web search is not configured on this server. Add TAVILY_API_KEY to enable the search agent."
    );
  }

  tool ??= new TavilySearch({
    maxResults: 5,
    topic: "general",
    includeImages: true,
    tavilyApiKey: env.TAVILY_API_KEY,
  });

  return tool;
};
