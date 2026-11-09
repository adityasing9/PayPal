
import {
  LayoutDashboard,
  ShoppingBag,
  PackageSearch,
  ShieldCheck,
  Wallet,
  History,
  Settings,
  LockKeyhole
} from "lucide-react";

import { NavLink } from "react-router-dom";

const menuItems = [
  { name: "Dashboard", icon: LayoutDashboard, path: "/" },
  { name: "AI Shopping", icon: ShoppingBag, path: "/shopping" },
  { name: "Compare Products", icon: PackageSearch, path: "/compare" },
  { name: "Security Center", icon: ShieldCheck, path: "/security" },
  { name: "Checkout", icon: Wallet, path: "/checkout" },
  { name: "Transactions", icon: History, path: "/transactions" },
];

function Sidebar() {
  return (
    <aside className="w-64 min-h-screen bg-white border-r border-slate-200 p-5 flex flex-col shrink-0">

      {/* Logo */}

      <div className="flex items-center gap-3 mb-10">
        <div className="bg-blue-600 p-2 rounded-xl text-white">
          <LockKeyhole size={23} />
        </div>

        <div>
          <h1 className="text-xl font-bold text-slate-900">
            IntentLock
          </h1>
          <p className="text-xs text-slate-500">
            Commerce Security
          </p>
        </div>
      </div>

      {/* Navigation */}

      <p className="text-xs text-slate-400 mb-4 uppercase tracking-wider font-semibold">
        Main Menu
      </p>

      <nav className="flex flex-col gap-2">

        {menuItems.map((item) => {
          const Icon = item.icon;

          return (
            <NavLink
              key={item.path}
              to={item.path}
              end={item.path === "/"}
              className={({ isActive }) =>
                `flex items-center gap-3 px-4 py-3 rounded-lg transition-all ${
                  isActive
                    ? "bg-blue-50 text-blue-700 font-semibold"
                    : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                }`
              }
            >
              <Icon size={19} />
              <span className="text-sm">{item.name}</span>
            </NavLink>
          );
        })}

      </nav>

      {/* Bottom Section */}

      <div className="mt-auto">

        <NavLink
          to="/settings"
          className={({ isActive }) =>
            `flex items-center gap-3 px-4 py-3 rounded-lg ${
              isActive
                ? "bg-blue-50 text-blue-700"
                : "text-slate-600 hover:bg-slate-100"
            }`
          }
        >
          <Settings size={19} />
          <span className="text-sm">Settings</span>
        </NavLink>

        <div className="mt-5 border-t border-slate-200 pt-5">
          <p className="text-xs text-slate-500">
            Protected by IntentLock
          </p>

          <p className="text-xs text-green-600 mt-2 font-medium">
            ● Security system active
          </p>
        </div>

      </div>

    </aside>
  );
}

export default Sidebar;
