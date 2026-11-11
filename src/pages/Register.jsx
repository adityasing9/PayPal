
import { useState } from "react";
import { Link, useNavigate, Navigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../context/ToastContext";

export default function Register() {
  const navigate = useNavigate();
  const toast = useToast();
  const { register, isAuthenticated } = useAuth();

  const [formData, setFormData] = useState({
    name: "",
    email: "",
    password: "",
    confirmPassword: "",
  });

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  if (isAuthenticated) {
    return <Navigate to="/" replace />;
  }

  function handleChange(e) {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value,
    });
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");

    if (formData.password !== formData.confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setLoading(true);

    try {
    const { confirmPassword, ...userData } = formData;

    await register(userData);

    toast.showToast("Account created successfully!", "success");
    navigate("/");
    } catch (err) {
    setError(err.message || "Registration failed. Please try again.");

    toast.showToast(
        err.message || "Registration failed. Please try again.",
        "error"
    );
    } finally {
    setLoading(false);
    }

  }

  return (
    <div className="min-h-screen bg-[#F7F5F0] flex items-center justify-center px-4 py-10">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-lg border border-[#BFE7DF] p-8">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-[#0D9488]">
            IntentLock
          </h1>
          <p className="text-[#78716C] mt-2">
            Secure AI-powered shopping
          </p>
        </div>

        <h2 className="text-2xl font-semibold text-[#1C1917] mb-2">
          Create your account
        </h2>

        <p className="text-[#78716C] mb-6">
          Join IntentLock for safer AI-powered shopping.
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-2">
              Full name
            </label>

            <input
              type="text"
              name="name"
              value={formData.name}
              onChange={handleChange}
              placeholder="Your name"
              required
              autoComplete="name"
              className="w-full border border-gray-300 rounded-lg px-4 py-3 outline-none focus:ring-2 focus:ring-[#0D9488]"
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">
              Email address
            </label>

            <input
              type="email"
              name="email"
              value={formData.email}
              onChange={handleChange}
              placeholder="you@example.com"
              required
              autoComplete="email"
              className="w-full border border-gray-300 rounded-lg px-4 py-3 outline-none focus:ring-2 focus:ring-[#0D9488]"
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">
              Password
            </label>

            <input
              type="password"
              name="password"
              value={formData.password}
              onChange={handleChange}
              placeholder="Create a password"
              required
              autoComplete="new-password"
              className="w-full border border-gray-300 rounded-lg px-4 py-3 outline-none focus:ring-2 focus:ring-[#0D9488]"
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">
              Confirm password
            </label>

            <input
              type="password"
              name="confirmPassword"
              value={formData.confirmPassword}
              onChange={handleChange}
              placeholder="Confirm your password"
              required
              autoComplete="new-password"
              className="w-full border border-gray-300 rounded-lg px-4 py-3 outline-none focus:ring-2 focus:ring-[#0D9488]"
            />
          </div>

          {error && (
            <div className="bg-red-50 text-red-700 border border-red-200 rounded-lg p-3 text-sm">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-[#0D9488] hover:bg-[#0F766E] disabled:opacity-60 text-white font-semibold py-3 rounded-lg transition"
          >
            {loading ? "Creating account..." : "Create account"}
          </button>
        </form>

        <p className="text-center text-sm text-[#78716C] mt-6">
          Already have an account?{" "}
          <Link
            to="/login"
            className="text-[#0D9488] font-semibold hover:underline"
          >
            Sign in
          </Link>
        </p>

        <p className="text-center text-xs text-[#A8A29E] mt-8">
          Protected by IntentLock Security Firewall
        </p>
      </div>
    </div>
  );
}
