import axios from "axios";
import { clearAccessToken, getAccessToken, setAccessToken } from "./token";

const api = axios.create({
  baseURL: import.meta.env.VITE_SERVER_URL,
  // Needed so the browser sends the httpOnly refresh cookie on refresh/logout.
  withCredentials: true,
});

api.interceptors.request.use((config) => {
  const token = getAccessToken();

  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }

  return config;
});

/**
 * Silent refresh.
 *
 * Access tokens last 15 minutes, so an active user will hit an expired one
 * mid-session. Rather than bouncing them to the login page, the first request
 * that gets a 401 quietly exchanges the refresh cookie for a new access token
 * and replays the original request. The user sees a slightly slower request and
 * nothing else.
 *
 * `refreshPromise` is the important detail. If five requests are in flight when
 * the token expires, all five get a 401 at once. Without sharing one promise
 * they would each call /refresh — and since every refresh rotates the token,
 * four of those would present an already-retired token, trip the reuse
 * detection, and sign the user out. So the first 401 starts the refresh and the
 * rest wait on that same promise.
 */
let refreshPromise = null;

const refreshAccessToken = async () => {
  refreshPromise =
    refreshPromise ??
    api
      .post("/api/auth/refresh")
      .then(({ data }) => {
        setAccessToken(data.accessToken);
        return data;
      })
      .finally(() => {
        refreshPromise = null;
      });

  return refreshPromise;
};

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const original = error.config;
    const status = error.response?.status;

    const isAuthEndpoint = original?.url?.includes("/api/auth/");

    /**
     * Only retry once. `_retried` prevents an infinite loop where the retry
     * itself 401s and triggers another refresh forever. Auth endpoints are
     * excluded because a failing refresh must be allowed to fail — retrying it
     * is what would cause the loop.
     */
    if (status === 401 && !original?._retried && !isAuthEndpoint) {
      original._retried = true;

      try {
        await refreshAccessToken();
        return api(original);
      } catch (refreshError) {
        // The refresh token is gone, expired, or was revoked by reuse detection.
        clearAccessToken();
        return Promise.reject(refreshError);
      }
    }

    return Promise.reject(error);
  }
);

export { refreshAccessToken };
export default api;
