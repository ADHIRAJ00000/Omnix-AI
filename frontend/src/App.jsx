import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { useSelector } from "react-redux";
import Home from "./pages/Home";
import Login from "./pages/Login";
import Register from "./pages/Register";
import ProtectedRoute from "./components/ProtectedRoute";
import useCurrentUser from "./hooks/useCurrentUser";

/**
 * Keeps a signed-in user off the login and register pages — landing there with
 * a live session is confusing, so send them to the app instead.
 */
function PublicOnly({ children }) {
  const { userData, authChecked } = useSelector((state) => state.user);

  if (authChecked && userData) {
    return <Navigate to="/" replace />;
  }

  return children;
}

function App() {
  // Restores the session from the refresh cookie before anything renders.
  useCurrentUser();

  return (
    <BrowserRouter>
      <Routes>
        <Route
          path="/login"
          element={
            <PublicOnly>
              <Login />
            </PublicOnly>
          }
        />
        <Route
          path="/register"
          element={
            <PublicOnly>
              <Register />
            </PublicOnly>
          }
        />
        <Route
          path="/"
          element={
            <ProtectedRoute>
              <Home />
            </ProtectedRoute>
          }
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
