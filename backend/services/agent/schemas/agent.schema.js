import { z } from "zod";
import { objectId } from "../../../shared/http/validate.js";

/**
 * The request body arrives as multipart/form-data when a file is attached, so
 * every field is a string at this point — hence no coercion to other types here.
 */
export const chatSchema = {
  body: z.object({
    prompt: z
      .string()
      .trim()
      .min(1, "Please type a message")
      // Bounded so one request cannot push an enormous prompt into the model and
      // burn through the free-tier token quota in a single call.
      .max(20_000, "That message is too long"),

    conversationId: objectId,

    agent: z
      .enum(["chat", "search", "coding", "pdf", "ppt", "image", "vision", "pdfRag"])
      .optional(),
  }),
};
