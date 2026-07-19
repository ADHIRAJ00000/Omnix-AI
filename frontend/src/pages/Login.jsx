import { useState } from "react";
import { useDispatch } from "react-redux";
import { Link, useLocation, useNavigate } from "react-router-dom";
import AuthForm from "../components/AuthForm";
import { loginUser, readApiError } from "../features/auth.api";
import { setUserData } from "../redux/user.slice";
import { isPopupDismissed, useGoogleLogin } from "../hooks/useGoogleLogin";

function Login() {
  const [form, setForm] = useState({ email: "", password: "" });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const dispatch = useDispatch();
  const navigate = useNavigate();
  const location = useLocation();
  const googleLogin = useGoogleLogin();

  // Where the user was headed before being redirected here, so signing in
  // returns them to it rather than dumping them on the home page.
  const destination = location.state?.from ?? "/";

  const update = (key) => (event) => setForm((prev) => ({ ...prev, [key]: event.target.value }));

  const finish = (user) => {
    dispatch(setUserData(user));
    navigate(destination, { replace: true });
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError("");
    setBusy(true);

    try {
      finish(await loginUser(form));
    } catch (err) {
      setError(readApiError(err));
    } finally {
      setBusy(false);
    }
  };

  const handleGoogle = async () => {
    setError("");
    setBusy(true);

    try {
      finish(await googleLogin());
    } catch (err) {
      if (!isPopupDismissed(err)) setError(readApiError(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthForm
      title="Welcome back"
      subtitle="Sign in to continue to CortexAI."
      error={error}
      busy={busy}
      submitLabel="Sign in"
      onSubmit={handleSubmit}
      onGoogle={handleGoogle}
      fields={[
        {
          name: "email",
          label: "Email",
          type: "email",
          value: form.email,
          onChange: update("email"),
          autoComplete: "email",
          placeholder: "you@example.com",
        },
        {
          name: "password",
          label: "Password",
          type: "password",
          value: form.password,
          onChange: update("password"),
          autoComplete: "current-password",
          placeholder: "••••••••",
        },
      ]}
      footer={
        <>
          New here?{" "}
          <Link to="/register" className="text-indigo-400 hover:text-indigo-300">
            Create an account
          </Link>
        </>
      }
    />
  );
}

export default Login;
