import axios from "axios";
import { env } from "../config/env.js";

/**
 * The one HTTP client for calling other services.
 *
 * Mirrors the agent service's client: the internal key is attached once here
 * rather than at each call site, and a timeout stops a hung service from
 * holding a payment request open.
 *
 * Having it in its own module also makes it mockable in tests without stubbing
 * axios globally — which matters because each service installs its own copy of
 * axios, so a global mock does not reliably reach the code under test.
 */
export const internalClient = axios.create({
  timeout: 10_000,
  headers: { "x-internal-key": env.INTERNAL_API_KEY },
});
