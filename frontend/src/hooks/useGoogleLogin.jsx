import { loginWithGoogle } from "../features/auth.api";

/** Google sign-in needs real Firebase config; without it the button cannot work. */
export const isGoogleConfigured = () => Boolean(import.meta.env.VITE_FIREBASE_API_KEY);

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
        "Google sign-in is not configured. Add VITE_FIREBASE_API_KEY to the frontend .env, or sign in with email instead."
      );
    }

    const [{ signInWithPopup }, { auth, googleProvider }] = await Promise.all([
      import("firebase/auth"),
      import("../../firebase"),
    ]);

    const result = await signInWithPopup(auth, googleProvider);
    const firebaseIdToken = await result.user.getIdToken();

    return loginWithGoogle(firebaseIdToken);
  };
};

/**
 * Popup closures are a user action, not a failure — clicking away or pressing
 * escape should not paint a scary red error banner.
 */
export const isPopupDismissed = (error) =>
  ["auth/popup-closed-by-user", "auth/cancelled-popup-request"].includes(error?.code);
