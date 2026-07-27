import { useSelector } from "react-redux";
import { Navigate, useLocation } from "react-router-dom";

/**
 * Gates the app behind a signed-in user.
 *
 * `authChecked` is what stops the login page flashing on every reload: until
 * the silent refresh has finished we genuinely do not know whether the user is
 * signed in, so we show a loading state rather than guessing "signed out" and
 * redirecting someone who was in fact logged in.
 *
 * This is a convenience, not a security control — the real enforcement is the
 * gateway rejecting requests without a valid token. Nothing here protects data.
 */
function ProtectedRoute({ children }) {
  const { userData, authChecked } = useSelector((state) => state.user);
  const location = useLocation();

  if (!authChecked) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#0d0f14]">
        <div className="flex flex-col items-center gap-3">
          <div className="w-7 h-7 rounded-full border-2 border-cyan-500/30 border-t-cyan-400 animate-spin" />
          <p className="text-[13px] text-slate-500">Loading…</p>
        </div>
      </div>
    );
  }

  if (!userData) {
    // Remember where they were going so login can send them back there.
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  return children;
}

export default ProtectedRoute;
