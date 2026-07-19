import { readFileSync } from "node:fs";
import { initializeApp, cert, getApps } from "firebase-admin/app";
import { AppError } from "../../../shared/errors/AppError.js";

/**
 * Loads Firebase credentials from an env var, falling back to the local file.
 *
 * Why both: serviceAccount.json is gitignored (it holds a private key and must
 * never be committed), so it does not exist on the deployed server. Hosts like
 * Render supply secrets as environment variables instead, so in production we
 * read the same JSON from FIREBASE_SERVICE_ACCOUNT. Locally the file is more
 * convenient, so that path still works.
 */
const loadServiceAccount = () => {
  const fromEnv = process.env.FIREBASE_SERVICE_ACCOUNT;

  if (fromEnv) {
    try {
      return JSON.parse(fromEnv);
    } catch {
      throw AppError.internal(
        "FIREBASE_SERVICE_ACCOUNT is set but is not valid JSON"
      );
    }
  }

  let raw;
  try {
    raw = readFileSync(new URL("../serviceAccount.json", import.meta.url), "utf8");
  } catch {
    throw AppError.internal("Firebase credentials are not configured");
  }

  const parsed = JSON.parse(raw);

  // The placeholder file that ships with the repo parses fine but is not usable.
  if (!parsed.private_key || !parsed.client_email) {
    throw AppError.internal("Firebase credentials are not configured");
  }

  return parsed;
};

let cached;

/**
 * Initialised on first use rather than at import time.
 *
 * Why lazy: only login needs Firebase. Initialising at import meant the whole
 * service refused to start without credentials, taking the credit endpoints —
 * which other services depend on and which have nothing to do with Firebase —
 * down with it.
 */
export const getFirebaseApp = () => {
  if (cached) return cached;

  cached = getApps()[0] ?? initializeApp({ credential: cert(loadServiceAccount()) });
  return cached;
};
