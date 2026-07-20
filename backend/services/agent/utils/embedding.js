import { GoogleGenerativeAIEmbeddings } from "@langchain/google-genai";
import { env } from "../config/env.js";
import { AppError } from "../../../shared/errors/AppError.js";

/**
 * The embedding model, built on first use rather than at import.
 *
 * Constructing it eagerly demanded GOOGLE_API_KEY the moment anything imported
 * this file — and since the graph imports every agent, that made an embeddings
 * key a hard requirement for starting the service, even for someone who never
 * touches the RAG agent. Deferring it keeps a missing key scoped to the feature
 * that actually needs it.
 */
let cached;

export const getEmbeddings = () => {
  if (!env.GOOGLE_API_KEY) {
    throw AppError.badRequest(
      "Document search is not configured on this server. Add GOOGLE_API_KEY to enable it."
    );
  }

  cached ??= new GoogleGenerativeAIEmbeddings({
    apiKey: env.GOOGLE_API_KEY,
    model: "gemini-embedding-001",
  });

  return cached;
};
