import { loginWithGoogle } from "../features/auth.api";

/**
 * Google sign-in needs real Firebase config; without it the button cannot work.
 *
 * All three are checked, not just the key: the popup is served from authDomain
 * and the ID token is issued against projectId, so a partial config produces a
 * popup that opens and then fails, which is harder to diagnose than a button
 * that never appears.
 */
export const isGoogleConfigured = () =>
  Boolean(
    import.meta.env.VITE_FIREBASE_API_KEY &&
      import.meta.env.VITE_FIREBASE_AUTH_DOMAIN &&
      import.meta.env.VITE_FIREBASE_PROJECT_ID
  );

/**
 * Firebase proves who the user is, then our backend issues its own tokens.
 *
 * Firebase is only an identity provider here — it is not the session. That is
 * what lets Google and email/password users share one session mechanism, so
 * nothing downstream needs to know which was used.
 *
 * The SDK is imported dynamically rather than at the top of the file for two
 * reasons: it is a large dependency that most page loads never need, and
 * importing it eagerly would run Firebase's initialisation on every visit —
 * including when the project has no Firebase config, where it is pure cost for
 * a feature that cannot run.
 */
export const useGoogleLogin = () => {
  return async () => {
    if (!isGoogleConfigured()) {
      throw new Error(
        "Google sign-in is not configured. Add VITE_FIREBASE_API_KEY, " +
          "VITE_FIREBASE_AUTH_DOMAIN and VITE_FIREBASE_PROJECT_ID to the " +
          "frontend .env, or sign in with email instead."
      );
    }

    const [{ signInWithPopup }, { auth, googleProvider }] = await Promise.all([
      import("firebase/auth"),
      import("../../firebase"),
    ]);

    let result;
    try {
      result = await signInWithPopup(auth, googleProvider);
    } catch (error) {
      // Dismissals are handled by the caller as a non-error, so they must pass
      // through untouched rather than being rewritten into a message.
      if (isPopupDismissed(error)) throw error;

      // The original is kept as the cause so the Firebase code survives in the
      // console for debugging, while the user reads the plain explanation.
      throw new Error(describeFirebaseError(error), { cause: error });
    }

    const firebaseIdToken = await result.user.getIdToken();

    return loginWithGoogle(firebaseIdToken);
  };
};

/**
 * Firebase reports setup mistakes accurately but not helpfully: the raw text is
 * "Firebase: Error (auth/operation-not-allowed)", which says nothing about
 * which switch was left off. Each of these is a specific thing to go and do,
 * and every one of them is a console setting rather than a bug in this app.
 */
const FIREBASE_ERRORS = {
  "auth/operation-not-allowed":
    "Google sign-in is switched off for this Firebase project. Enable it under Authentication → Sign-in method → Google.",
  "auth/unauthorized-domain":
    "This site's domain is not allowed to sign in. Add it under Authentication → Settings → Authorized domains.",
  "auth/configuration-not-found":
    "This Firebase project has no sign-in configuration. Open Authentication in the Firebase console and enable the Google provider.",
  "auth/invalid-api-key":
    "The Firebase API key is wrong. Check VITE_FIREBASE_API_KEY against Project settings → Your apps.",
  "auth/popup-blocked":
    "Your browser blocked the sign-in popup. Allow popups for this site and try again.",
  "auth/network-request-failed":
    "Could not reach Firebase. Check your connection and try again.",
};

const describeFirebaseError = (error) =>
  FIREBASE_ERRORS[error?.code] ??
  `Google sign-in failed${error?.code ? ` (${error.code})` : ""}. Please try again.`;

/**
 * Popup closures are a user action, not a failure — clicking away or pressing
 * escape should not paint a scary red error banner.
 */
export const isPopupDismissed = (error) =>
  ["auth/popup-closed-by-user", "auth/cancelled-popup-request"].includes(error?.code);
