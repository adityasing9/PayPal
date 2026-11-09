import { useEffect, useState } from "react";
import { Routes, Route, useLocation } from "react-router-dom";

import Navbar from "./components/layout/Navbar";
import { ToastProvider } from "./context/ToastContext";

import Dashboard from "./pages/Dashboard";
import Shopping from "./pages/Shopping";
import Comparison from "./pages/Comparison";
import Security from "./pages/Security";
import Checkout from "./pages/Checkout";
import Transactions from "./pages/Transactions";
import Settings from "./pages/Settings";
import PlaceholderPage from "./pages/PlaceholderPage";

function App() {
  const location = useLocation();

  const [theme, setTheme] = useState("light");
  
  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
    localStorage.setItem("intentlock-theme", theme);
  }, [theme]);

  const toggleTheme = () => {
    setTheme((currentTheme) =>
      currentTheme === "light" ? "dark" : "light"
    );
  };

  return (
    <ToastProvider>
      <div className="app-shell min-h-screen w-full">
        <Navbar theme={theme} onToggleTheme={toggleTheme} />

        <main className="w-full">
          <div key={location.pathname} className="page-transition">
            <Routes location={location}>
              <Route path="/" element={<Dashboard />} />
              <Route path="/shopping" element={<Shopping />} />
              <Route path="/compare" element={<Comparison />} />
              <Route path="/security" element={<Security />} />
              <Route path="/checkout" element={<Checkout />} />
              <Route path="/transactions" element={<Transactions />} />
              <Route path="/settings" element={<Settings />} />

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
    </ToastProvider>
  );
}

export default App;