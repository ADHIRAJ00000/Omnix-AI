import { useState } from "react";
import { useDispatch } from "react-redux";
import { Link, useNavigate } from "react-router-dom";
import AuthForm from "../components/AuthForm";
import { readApiError, registerUser } from "../features/auth.api";
import { setUserData } from "../redux/user.slice";
import { isPopupDismissed, useGoogleLogin } from "../hooks/useGoogleLogin";

function Register() {
  const [form, setForm] = useState({ name: "", email: "", password: "" });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const dispatch = useDispatch();
  const navigate = useNavigate();
  const googleLogin = useGoogleLogin();

  const update = (key) => (event) => setForm((prev) => ({ ...prev, [key]: event.target.value }));

  const finish = (user) => {
    dispatch(setUserData(user));
    navigate("/", { replace: true });
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError("");

    // Checked here as well as on the server so the user gets the answer
    // instantly. The server check is the one that actually enforces it.
    if (form.password.length < 8) {
      setError("Password must be at least 8 characters");
      return;
    }

    setBusy(true);

    try {
      finish(await registerUser(form));
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
      title="Create your account"
      subtitle="Start with 100 free credits."
      error={error}
      busy={busy}
      submitLabel="Create account"
      onSubmit={handleSubmit}
      onGoogle={handleGoogle}
      fields={[
        {
          name: "name",
          label: "Name",
          type: "text",
          value: form.name,
          onChange: update("name"),
          autoComplete: "name",
          placeholder: "Your name",
        },
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
          autoComplete: "new-password",
          placeholder: "••••••••",
          hint: "At least 8 characters",
        },
      ]}
      footer={
        <>
          Already have an account?{" "}
          <Link to="/login" className="text-cyan-400 hover:text-cyan-300">
            Sign in
          </Link>
        </>
      }
    />
  );
}

export default Register;
