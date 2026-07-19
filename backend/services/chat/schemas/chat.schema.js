import { z } from "zod";
import { objectId } from "../../../shared/http/validate.js";

/**
 * The contract for every chat endpoint. Limits here are deliberate: they stop a
 * single request from writing an unbounded document to mongo.
 */

const artifactSchema = z.object({
  id: z.union([z.number(), z.string()]),
  type: z.string().max(50),
  title: z.string().max(300).optional(),
  files: z
    .array(
      z.object({
        name: z.string().max(300),
        content: z.string(),
      })
    )
    .max(20)
    .optional(),
  createdAt: z.string().optional(),
});

export const createConversationSchema = {
  body: z
    .object({
      title: z.string().trim().min(1).max(200).optional(),
    })
    .default({}),
};

export const updateConversationSchema = {
  body: z.object({
    conversationId: objectId,
    title: z.string().trim().min(1, "Title cannot be empty").max(200),
  }),
};

export const saveMessageSchema = {
  body: z.object({
    conversationId: objectId,
    role: z.enum(["user", "assistant"]),
    content: z.string().max(100_000).default(""),
    images: z.array(z.string().url()).max(10).default([]),
    artifacts: z.array(artifactSchema).max(20).default([]),
  }),
};

export const conversationIdParamSchema = {
  params: z.object({
    id: objectId,
  }),
};
