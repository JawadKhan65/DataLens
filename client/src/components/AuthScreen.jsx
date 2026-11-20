import { useState } from "react";
import { Activity, Eye, EyeOff, ShieldCheck } from "lucide-react";
import { API_URL } from "../config.js";

function AuthScreen({ mode, setMode, onSuccess, notice }) {
  const [form, setForm] = useState({
    name: "",
    email: "",
    password: "",
    confirmPassword: "",
  });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const isRegister = mode === "register";

  async function submit(event) {
    event.preventDefault();
    setError("");
    if (isRegister && form.name.trim().length > 60) {
      setError("Name must be 60 characters or fewer.");
      return;
    }
    if (isRegister && new TextEncoder().encode(form.password).length > 72) {
      setError("Password must use 72 bytes or fewer.");
      return;
    }
    if (isRegister && form.password !== form.confirmPassword) {
      setError("Passwords do not match.");
      return;
    }
    setLoading(true);
    try {
      const response = await fetch(`${API_URL}/auth/${mode}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.message || "Could not sign in.");
      onSuccess(result);
    } catch (requestError) {
      setError(
        requestError.message === "Failed to fetch"
          ? "Could not connect to the API. Start the server and MongoDB, then try again."
          : requestError.message,
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="auth-page">
      <div className="auth-card">
        <div className="brand auth-brand">
          <div className="brand-mark">
            <Activity size={18} strokeWidth={2.8} />
          </div>
          <span>
            data<span className="brand-light">lens</span>
          </span>
          <span className="brand-beta">BETA</span>
        </div>
        <div className="auth-intro">
          <div className="eyebrow">YOUR DATA, MADE CLEAR</div>
          <h1>{isRegister ? "Create your account" : "Welcome back"}</h1>
          <p>
            {isRegister
              ? "Start exploring your datasets in a few clicks."
              : "Sign in to continue to your workspace."}
          </p>
        </div>
        {notice && <div className="auth-error session-notice">{notice}</div>}
        <form className="auth-form" onSubmit={submit}>
          {isRegister && (
            <label>
              Your name
              <input
                autoComplete="name"
                maxLength={60}
                value={form.name}
                onChange={(event) =>
                  setForm({ ...form, name: event.target.value })
                }
                placeholder="Jawad Khan"
                required
              />
            </label>
          )}
          <label>
            Email address
            <input
              type="email"
              autoComplete="email"
              maxLength={254}
              value={form.email}
              onChange={(event) =>
                setForm({ ...form, email: event.target.value })
              }
              placeholder="you@example.com"
              required
            />
          </label>
          <label>
            Password
            <span className="password-control">
              <input
                type={showPassword ? "text" : "password"}
                autoComplete={isRegister ? "new-password" : "current-password"}
                minLength={isRegister ? 8 : undefined}
                value={form.password}
                onChange={(event) =>
                  setForm({ ...form, password: event.target.value })
                }
                placeholder={
                  isRegister ? "At least 8 characters" : "Enter your password"
                }
                required
              />
              <button
                type="button"
                className="password-toggle"
                aria-label={showPassword ? "Hide password" : "Show password"}
                onClick={() => setShowPassword((value) => !value)}
              >
                {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
              </button>
            </span>
            {isRegister && (
              <small
                className={`password-hint ${form.password.length >= 8 && new TextEncoder().encode(form.password).length <= 72 ? "valid" : ""}`}
              >
                {form.password.length < 8
                  ? "Use at least 8 characters."
                  : new TextEncoder().encode(form.password).length > 72
                    ? "Password is too long for secure hashing."
                    : "Password length looks good."}
              </small>
            )}
          </label>
          {isRegister && (
            <label>
              Confirm password
              <input
                type={showPassword ? "text" : "password"}
                autoComplete="new-password"
                value={form.confirmPassword}
                onChange={(event) =>
                  setForm({ ...form, confirmPassword: event.target.value })
                }
                placeholder="Enter your password again"
                required
              />
            </label>
          )}
          {error && <div className="auth-error">{error}</div>}
          <button className="auth-submit" disabled={loading}>
            {loading
              ? "Please wait…"
              : isRegister
                ? "Create account"
                : "Sign in"}
            <ArrowUpRight size={15} />
          </button>
        </form>
        <div className="auth-switch">
          {isRegister ? "Already have an account?" : "New to DataLens?"}{" "}
          <button
            onClick={() => {
              setError("");
              setForm({
                name: "",
                email: form.email,
                password: "",
                confirmPassword: "",
              });
              setMode(isRegister ? "login" : "register");
            }}
          >
            {isRegister ? "Sign in" : "Create an account"}
          </button>
        </div>
        <div className="auth-note">
          <ShieldCheck size={14} /> Your datasets are private to your account
        </div>
      </div>
    </main>
  );
}

export default AuthScreen;
