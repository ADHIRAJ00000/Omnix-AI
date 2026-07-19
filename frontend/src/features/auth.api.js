import api from "../utils/axios";
import { setAccessToken, clearAccessToken } from "../utils/token";

/**
 * Every call here returns { accessToken, user }. The token is stashed in the
 * module singleton for axios to use, and the user is handed back for Redux —
 * so no caller has to remember to do both.
 */
const storeSession = ({ accessToken, user }) => {
  setAccessToken(accessToken);
  return user;
};

export const registerUser = async ({ name, email, password }) => {
  const { data } = await api.post("/api/auth/register", { name, email, password });
  return storeSession(data);
};

export const loginUser = async ({ email, password }) => {
  const { data } = await api.post("/api/auth/login", { email, password });
  return storeSession(data);
};

export const loginWithGoogle = async (firebaseIdToken) => {
  const { data } = await api.post("/api/auth/google", { token: firebaseIdToken });
  return storeSession(data);
};

export const logoutUser = async () => {
  try {
    await api.post("/api/auth/logout");
  } finally {
    // Clear locally even if the request fails, so the UI never shows someone as
    // signed in when they have asked to leave.
    clearAccessToken();
  }
};

/**
 * Turns an API error into something worth showing a user.
 *
 * The backend sends { message, code, details }, where details lists the exact
 * fields that failed validation — far more useful than a generic message.
 */
export const readApiError = (error) => {
  const data = error?.response?.data;

  if (data?.details?.length) {
    return data.details.map((d) => d.message).join(". ");
  }

  if (data?.message) return data.message;

  if (error?.code === "ERR_NETWORK") {
    return "Cannot reach the server. Is the backend running?";
  }

  // Errors we raise ourselves (like missing Google config) carry their own
  // message, which is already written for the user.
  if (error?.message && !error.response) return error.message;

  return "Something went wrong. Please try again.";
};
