import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { ChatGroq } from "@langchain/groq";
import { ChatOpenRouter } from "@langchain/openrouter";
import { env } from "../config/env.js";
import { AppError } from "../../../shared/errors/AppError.js";

/**
 * Which provider serves which agent, and which key each one needs.
 *
 * Kept as data rather than a switch so that adding a provider is one entry and
 * the "is this configured?" check cannot drift from the construction below.
 */
const PROVIDERS = {
  groq: {
    envKey: "GROQ_API_KEY",
    signupUrl: "https://console.groq.com/keys",
    create: () =>
      new ChatGroq({
        model: env.GROQ_MODEL,
        apiKey: env.GROQ_API_KEY,
        temperature: 0,
        maxRetries: 2,
      }),
  },
  gemini: {
    envKey: "GOOGLE_API_KEY",
    signupUrl: "https://aistudio.google.com/apikey",
    create: () =>
      new ChatGoogleGenerativeAI({
        model: env.GEMINI_MODEL,
        apiKey: env.GOOGLE_API_KEY,
      }),
  },
  openRouter: {
    envKey: "OPENROUTER_API_KEY",
    signupUrl: "https://openrouter.ai/keys",
    create: () =>
      new ChatOpenRouter({
        model: env.OPENROUTER_MODEL,
        apiKey: env.OPENROUTER_API_KEY,
        temperature: 0,
        maxTokens: 2500,
      }),
  },
};

const AGENT_PROVIDERS = {
  chat: "groq",
  search: "groq",
  image: "groq",
  vision: "gemini",
  coding: "openRouter",
};

const DEFAULT_PROVIDER = "groq";

/**
 * Clients are built on first use and cached, never at import time.
 *
 * Building them eagerly meant a missing OPENROUTER_API_KEY threw while this
 * module was still being imported. Because every agent imports this file and
 * the supervisor graph imports every agent, that one absent key stopped the
 * whole service from starting — so a deployment with no coding agent could not
 * serve chat either. Deferring construction keeps a missing key contained to
 * the one agent that needs it, which is what the .env comments promise.
 */
const cache = new Map();

export const getModel = (agent) => {
  const name = AGENT_PROVIDERS[agent] ?? DEFAULT_PROVIDER;

  if (cache.has(name)) {
    return cache.get(name);
  }

  const provider = PROVIDERS[name];

  if (!env[provider.envKey]) {
    throw AppError.badRequest(
      `The ${agent} agent is not configured on this server. ` +
        `Add ${provider.envKey} to enable it — get one at ${provider.signupUrl}.`
    );
  }

  const client = provider.create();
  cache.set(name, client);

  return client;
};
