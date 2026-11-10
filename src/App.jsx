
import { useEffect } from "react";
import {
  Routes,
  Route,
  useLocation,
  Navigate,
  Outlet,
} from "react-router-dom";

import Navbar from "./components/layout/Navbar";
import { ToastProvider } from "./context/ToastContext";
import { AuthProvider, useAuth } from "./context/AuthContext";

import Dashboard from "./pages/Dashboard";
import Shopping from "./pages/Shopping";
import Comparison from "./pages/Comparison";
import Security from "./pages/Security";
import Checkout from "./pages/Checkout";
import Transactions from "./pages/Transactions";
import Settings from "./pages/Settings";
import PlaceholderPage from "./pages/PlaceholderPage";

import Login from "./pages/Login";
import Register from "./pages/Register";

// Protect pages that require authentication
function ProtectedRoute() {
  const { isAuthenticated, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#F7F5F0]">
        <p className="text-teal-700 font-medium">
          Checking your session...
        </p>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  return <Outlet />;
}

function AppContent() {
  const location = useLocation();

  const isAuthPage =
    location.pathname === "/login" ||
    location.pathname === "/register";

  useEffect(() => {
    document.documentElement.dataset.theme = "teal";
    document.documentElement.classList.remove("dark");
    localStorage.setItem("intentlock-theme", "teal");
  }, []);

  return (
    <div className="app-shell min-h-screen w-full">
      {!isAuthPage && <Navbar />}

      <main className="w-full">
        <div key={location.pathname} className="page-transition">
          <Routes>
            {/* Public routes */}
            <Route path="/login" element={<Login />} />
            <Route path="/register" element={<Register />} />

            {/* Protected routes */}
            <Route element={<ProtectedRoute />}>
              <Route path="/" element={<Dashboard />} />
              <Route path="/shopping" element={<Shopping />} />
              <Route path="/compare" element={<Comparison />} />
              <Route path="/security" element={<Security />} />
              <Route path="/checkout" element={<Checkout />} />
              <Route path="/transactions" element={<Transactions />} />
              <Route path="/settings" element={<Settings />} />
            </Route>

            <Route
              path="*"
              element={
                <PlaceholderPage
                  title="Page Not Found"
                  description="The page you are looking for does not exist."
                />
              }
            />
          </Routes>
        </div>
      </main>
    </div>
  );
}

function App() {
  return (
    <ToastProvider>
      <AuthProvider>
        <AppContent />
      </AuthProvider>
    </ToastProvider>
  );
}

export default App;
