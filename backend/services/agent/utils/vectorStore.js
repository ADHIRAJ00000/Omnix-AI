import { QdrantVectorStore } from "@langchain/qdrant";
import { getEmbeddings } from "./embedding.js";
import { env } from "../config/env.js";
import { AppError } from "../../../shared/errors/AppError.js";

const requireQdrant = () => {
  if (!env.QDRANT_URL) {
    throw AppError.badRequest(
      "Document search is not configured on this server. Add QDRANT_URL to enable it."
    );
  }

  return { url: env.QDRANT_URL, apiKey: env.QDRANT_API_KEY };
};

export const createVectorStore = async (collectionName, docs) => {
  const { url, apiKey } = requireQdrant();

  return QdrantVectorStore.fromDocuments(docs, getEmbeddings(), {
    url,
    apiKey,
    collectionName,
  });
};
