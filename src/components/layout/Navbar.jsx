
import { NavLink } from "react-router-dom";

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
  Moon,
  Sun,
} from "lucide-react";

import { useToast } from "../../context/ToastContext";

const navItems = [
  { name: "Dashboard", path: "/", icon: LayoutDashboard },
  { name: "AI Shopping", path: "/shopping", icon: ShoppingBag },
  { name: "Compare", path: "/compare", icon: Scale },
  { name: "Security", path: "/security", icon: Shield },
  { name: "Checkout", path: "/checkout", icon: CreditCard },
  { name: "Transactions", path: "/transactions", icon: Receipt },
  { name: "Settings", path: "/settings", icon: Settings },
];

function Navbar({ theme, onToggleTheme }) {
  const { showToast } = useToast();

  return (
    <header className="sticky top-0 z-50 w-full border-b border-stone-200 bg-white/95 backdrop-blur-xl">
      <div className="mx-auto flex min-h-[72px] max-w-[1600px] items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">

        {/* Logo */}
        <NavLink to="/" className="flex shrink-0 items-center gap-2">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-teal-600 text-white shadow-md shadow-teal-200">
            <ShieldCheck size={23} />
          </div>

          <div>
            <h1 className="text-lg font-extrabold tracking-tight text-stone-900">
              IntentLock
            </h1>
            <p className="text-[10px] font-medium tracking-widest text-stone-500">
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
                      ? "bg-teal-50 text-teal-800"
                      : "text-stone-600 hover:bg-teal-50 hover:text-teal-800"
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
            className="rounded-xl p-2.5 text-stone-600 hover:bg-teal-50 hover:text-teal-800"
          >
            <Bell size={19} />
          </button>

          {/* Theme Toggle */}
          <button
            type="button"
            onClick={onToggleTheme}
            title={
              theme === "dark"
                ? "Switch to light mode"
                : "Switch to dark mode"
            }
            aria-label={
              theme === "dark"
                ? "Switch to light mode"
                : "Switch to dark mode"
            }
            className="rounded-xl border border-stone-200 bg-white p-2.5 text-stone-700 shadow-sm hover:bg-teal-50 hover:text-teal-800"
          >
            {theme === "dark" ? (
              <Sun size={19} />
            ) : (
              <Moon size={19} />
            )}
          </button>
        </div>
      </div>
    </header>
  );
}

export default Navbar;
