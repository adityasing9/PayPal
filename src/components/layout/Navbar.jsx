
import { NavLink, useNavigate } from "react-router-dom";

import {
  ShieldCheck,
  LayoutDashboard,
  ShoppingBag,
  Scale,
  Shield,
  CreditCard,
  Receipt,
  Settings,
  Bell,
  LogOut,
} from "lucide-react";

import { useToast } from "../../context/ToastContext";
import { useAuth } from "../../context/AuthContext";

const navItems = [
  { name: "Dashboard", path: "/", icon: LayoutDashboard },
  { name: "AI Shopping", path: "/shopping", icon: ShoppingBag },
  { name: "Compare", path: "/compare", icon: Scale },
  { name: "Security", path: "/security", icon: Shield },
  { name: "Checkout", path: "/checkout", icon: CreditCard },
  { name: "Transactions", path: "/transactions", icon: Receipt },
  { name: "Settings", path: "/settings", icon: Settings },
];

function Navbar() {
  const { showToast } = useToast();
  const { logout } = useAuth();
  const navigate = useNavigate();

  async function handleLogout() {
    try {
      await logout();

      showToast("Logged out successfully!", "success");
      navigate("/login", { replace: true });
    } catch (error) {
      showToast(
        error.message || "Logout failed. Please try again.",
        "error"
      );
    }
  }

  return (
    <header className="sticky top-0 z-50 w-full border-b border-[#E7E5E4] bg-white/95 backdrop-blur-xl">
      <div className="mx-auto flex min-h-[72px] max-w-[1600px] items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">

        {/* Logo */}
        <NavLink
          to="/"
          className="flex shrink-0 items-center gap-2 bg-transparent shadow-none"
          style={{ background: "transparent", boxShadow: "none" }}
        >
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#0D9488] text-white">
            <ShieldCheck size={23} />
          </div>

          <div className="bg-transparent">
            <h1 className="text-lg font-extrabold tracking-tight text-[#1C1917]">
              IntentLock
            </h1>

            <p className="text-[10px] font-medium tracking-widest text-[#78716C]">
              SMART COMMERCE SECURITY
            </p>
          </div>
        </NavLink>

        {/* Navigation */}
        <nav className="flex flex-1 items-center justify-start gap-1 overflow-x-auto px-2 lg:justify-center">
          {navItems.map((item) => {
            const Icon = item.icon;

            return (
              <NavLink
                key={item.path}
                to={item.path}
                end={item.path === "/"}
                title={item.name}
                className={({ isActive }) =>
                  `flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-all duration-200 ${
                    isActive
                      ? "bg-[#E6F4F1] text-[#0F766E]"
                      : "text-[#78716C] hover:bg-[#E6F4F1] hover:text-[#0F766E]"
                  }`
                }
              >
                <Icon size={17} />
                <span className="hidden xl:inline">{item.name}</span>
              </NavLink>
            );
          })}
        </nav>

        {/* Right Controls */}
        <div className="flex shrink-0 items-center gap-2">

          {/* Security Status */}
          <div
            title="IntentLock security status"
            className="hidden items-center gap-2 rounded-full bg-green-50 px-3 py-2 text-xs font-semibold text-green-700 sm:flex"
          >
            <span className="security-pulse h-2 w-2 rounded-full bg-green-500" />
            Security Active
          </div>

          {/* Notifications */}
          <button
            type="button"
            title="View notifications"
            aria-label="Notifications"
            onClick={() =>
              showToast(
                "You're all caught up. No new notifications.",
                "info"
              )
            }
            className="flex h-11 w-11 items-center justify-center rounded-xl border border-[#BFE7DF] bg-[#E6F4F1] text-[#0D9488] shadow-sm transition-all hover:bg-[#D1EEE8]"
          >
            <Bell size={20} />
          </button>

          {/* Logout */}
          <button
            type="button"
            onClick={handleLogout}
            title="Logout"
            aria-label="Logout"
            className="flex h-11 items-center gap-2 rounded-xl border border-[#E7E5E4] bg-white px-3 text-sm font-medium text-[#78716C] transition-all hover:border-red-200 hover:bg-red-50 hover:text-red-600"
          >
            <LogOut size={18} />
            <span className="hidden sm:inline">Logout</span>
          </button>

        </div>
      </div>
    </header>
  );
}

export default Navbar;
