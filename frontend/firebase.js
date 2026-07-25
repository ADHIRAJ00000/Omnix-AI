import { initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider } from "firebase/auth";

/**
 * Firebase is the identity provider for the Google button, nothing more — the
 * session is still our own token pair, issued by the auth service after it
 * verifies the Firebase ID token.
 *
 * apiKey alone is not enough. signInWithPopup opens Firebase's OAuth handler at
 * authDomain and the ID token is issued against projectId, so both are required
 * for sign-in to complete; only apiKey was set before, which made the popup
 * fail every time. These values are public by design — they identify the
 * project, they do not authorise anything. Access is controlled by the
 * authorised-domains list in the Firebase console.
 */
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);

export const googleProvider = new GoogleAuthProvider();
