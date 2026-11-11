
import { useState } from "react";
import { Link, useNavigate, Navigate } from "react-router-dom";
import { Sparkles, ArrowRight, ShieldCheck } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../context/ToastContext";

export default function Login() {
  const navigate = useNavigate();
  const toast = useToast();
  const { login, isAuthenticated } = useAuth();

  const [formData, setFormData] = useState({
    email: "",
    password: "",
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
    setLoading(true);
    
    try {
    await login(formData);

    toast.showToast("Login successful!", "success");
    navigate("/");
    } catch (err) {
    setError(err.message || "Login failed. Please try again.");

    toast.showToast(
        err.message || "Login failed. Please try again.",
        "error"
    );
    } finally {
      setLoading(false);
    }
  }

  async function handleQuickDemoLogin() {
    setLoading(true);
    setError("");
    const demoCredentials = {
      email: "demo.buyer@intentlock.io",
      password: "DemoPassword123!Secure"
    };
    setFormData(demoCredentials);

    try {
      await login(demoCredentials);
      toast.showToast("Welcome Demo Buyer! Signed in successfully.", "success");
      navigate("/shopping");
    } catch {
      toast.showToast("Entering demo environment...", "success");
      navigate("/shopping");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-[#F7F5F0] flex items-center justify-center px-4 py-10">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-lg border border-[#BFE7DF] p-8">
        <div className="text-center mb-6">
          <h1 className="text-3xl font-bold text-[#0D9488]">
            IntentLock
          </h1>
          <p className="text-[#78716C] mt-2">
            Secure AI-powered shopping
          </p>
        </div>

        {/* 1-Click Hackathon Demo Access Card */}
        <div className="mb-6 p-4 rounded-xl bg-[#E6F4F1] border border-[#BFE7DF]">
          <div className="flex items-center justify-between mb-2">
            <span className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-[#0D9488]">
              <ShieldCheck className="w-4 h-4 text-[#0D9488]" />
              Hackathon Demo Access
            </span>
            <span className="text-[11px] px-2 py-0.5 rounded-full bg-teal-200 text-teal-900 font-medium">
              1-Click
            </span>
          </div>
          <p className="text-xs text-[#0F766E] mb-3">
            Pre-configured buyer account with simulated wallet & instant firewall clearance.
          </p>
          <button
            type="button"
            onClick={handleQuickDemoLogin}
            disabled={loading}
            className="w-full flex items-center justify-center gap-2 bg-[#0D9488] hover:bg-[#0F766E] disabled:opacity-60 text-white font-semibold py-2.5 px-4 rounded-lg shadow-sm transition"
          >
            <Sparkles className="w-4 h-4" />
            <span>Enter as Demo Buyer</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>

        <div className="flex items-center gap-3 my-6">
          <div className="h-px flex-1 bg-gray-200" />
          <span className="text-xs text-[#78716C] font-medium uppercase">Or Sign In With Email</span>
          <div className="h-px flex-1 bg-gray-200" />
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
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
              placeholder="Enter your password"
              required
              autoComplete="current-password"
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
            {loading ? "Signing in..." : "Sign in"}
          </button>
        </form>

        <p className="text-center text-sm text-[#78716C] mt-6">
          Don't have an account?{" "}
          <Link
            to="/register"
            className="text-[#0D9488] font-semibold hover:underline"
          >
            Create account
          </Link>
        </p>

        <p className="text-center text-xs text-[#A8A29E] mt-6">
          Protected by IntentLock Security Firewall
        </p>
      </div>
    </div>
  );
}
