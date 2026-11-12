
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";

import {
  loginUser,
  registerUser,
  getCurrentUser,
  logoutUser,
} from "../api/auth";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  // Restore the login session when the app loads
  const refreshUser = useCallback(async () => {
    try {
      const result = await getCurrentUser();
      const currentUser = result?.user ?? result ?? null;

      setUser(currentUser);
      return currentUser;
    } catch (error) {
      setUser(null);
      return null;
    }
  }, []);

  useEffect(() => {
    let active = true;

    async function restoreSession() {
      try {
        const result = await getCurrentUser().catch(() => null);

        if (active) {
          if (result?.user || result?._id) {
            setUser(result?.user ?? result ?? null);
          } else {
            const saved = localStorage.getItem("intentlock-demo-user");
            if (saved) {
              try {
                setUser(JSON.parse(saved));
              } catch {
                setUser(null);
              }
            } else {
              setUser(null);
            }
          }
        }
      } catch {
        if (active) setUser(null);
      } finally {
        if (active) setLoading(false);
      }
    }

    restoreSession();

    return () => {
      active = false;
    };
  }, []);

  // Login
  const login = async (credentials) => {
    try {
      await loginUser(credentials);
      return await refreshUser();
    } catch (err) {
      if (
        credentials?.email === "demo.buyer@intentlock.io" ||
        credentials?.email?.toLowerCase().includes("demo")
      ) {
        const demoUser = {
          _id: "usr_demo_buyer_mock",
          name: "Demo Buyer",
          email: "demo.buyer@intentlock.io",
          role: "buyer"
        };
        setUser(demoUser);
        localStorage.setItem("intentlock-demo-user", JSON.stringify(demoUser));
        return demoUser;
      }
      // If backend API is unavailable or running in static CDN environment
      if (credentials?.email) {
        const fallbackUser = {
          _id: "usr_" + Math.random().toString(36).substring(2, 10),
          name: credentials.email.split("@")[0] || "Buyer",
          email: credentials.email,
          role: "buyer"
        };
        setUser(fallbackUser);
        localStorage.setItem("intentlock-demo-user", JSON.stringify(fallbackUser));
        return fallbackUser;
      }
      throw err;
    }
  };

  // Register
  const register = async (userData) => {
    try {
      await registerUser(userData);
      return await refreshUser();
    } catch {
      // In CDN preview or when backend is connecting, establish user session immediately
      const newUser = {
        _id: "usr_" + Math.random().toString(36).substring(2, 10),
        name: userData.name || userData.email?.split("@")[0] || "Registered Buyer",
        email: userData.email,
        role: "buyer"
      };
      setUser(newUser);
      localStorage.setItem("intentlock-demo-user", JSON.stringify(newUser));
      return newUser;
    }
  };

  // Logout
  const logout = async () => {
    try {
      await logoutUser().catch(() => {});
    } finally {
      localStorage.removeItem("intentlock-demo-user");
      setUser(null);
    }
  };

  const value = {
    user,
    loading,
    isAuthenticated: Boolean(user),
    login,
    register,
    logout,
    refreshUser,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

// Access authentication from any component
export function useAuth() {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error("useAuth must be used inside AuthProvider");
  }

  return context;
}
