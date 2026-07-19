import { useEffect } from "react";
import { useDispatch } from "react-redux";
import { refreshAccessToken } from "../utils/axios";
import { setAccessToken } from "../utils/token";
import { clearUserData, setUserData } from "../redux/user.slice";

/**
 * Restores the session on startup.
 *
 * The access token only lives in memory, so a page reload always begins signed
 * out as far as the JavaScript is concerned. The httpOnly refresh cookie
 * survives though, so we trade it for a fresh access token before rendering
 * anything that depends on being signed in.
 *
 * A failure here is the normal "not signed in" case, not an error worth
 * surfacing — it just means there was no usable cookie.
 */
function useCurrentUser() {
  const dispatch = useDispatch();

  useEffect(() => {
    let cancelled = false;

    const restore = async () => {
      try {
        const data = await refreshAccessToken();

        if (cancelled) return;

        setAccessToken(data.accessToken);
        dispatch(setUserData(data.user));
      } catch {
        if (!cancelled) dispatch(clearUserData());
      }
    };

    restore();

    // React 18 StrictMode mounts effects twice in development; without this the
    // second run would refresh again with a token the first run already rotated.
    return () => {
      cancelled = true;
    };
  }, [dispatch]);
}

export default useCurrentUser;
