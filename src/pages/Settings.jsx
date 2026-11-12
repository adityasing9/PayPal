
import { useState } from "react";
import {
  User,
  ShoppingBag,
  ShieldCheck,
  Bell,
  LockKeyhole,
  Save,
  DollarSign,
  Mail,
  UserRound,
  Info,
  CheckCircle2,
} from "lucide-react";

function Settings() {
  const [profile, setProfile] = useState({
    name: "",
    email: "",
  });

  const [budget, setBudget] = useState("120");
  const [currency, setCurrency] = useState("USD");

  const [security, setSecurity] = useState({
    confirmPurchase: true,
    blockUnverifiedMerchants: true,
    detectSubscriptions: true,
    promptInjectionProtection: true,
  });

  const [strictMode, setStrictMode] = useState(false);
  const [autoBlockPrices, setAutoBlockPrices] = useState(true);
  const [shieldPulse, setShieldPulse] = useState(false);

  const [notifications, setNotifications] = useState({
    paymentAlerts: true,
    securityAlerts: true,
    transactionUpdates: true,
    productUpdates: false,
  });

  const [privacy, setPrivacy] = useState({
    saveShoppingHistory: true,
    saveSecurityLogs: true,
  });

  const [saved, setSaved] = useState(false);

  const updateProfile = (field, value) => {
    setProfile((previous) => ({
      ...previous,
      [field]: value,
    }));
    setSaved(false);
  };

  const updateToggle = (setter, field, value) => {
    setter((previous) => ({
      ...previous,
      [field]: value,
    }));
    setSaved(false);
  };

  const handleSecurityToggle = (setter, value) => {
  setter(value);
  setSaved(false);

    if (value) {
      setShieldPulse(true);
    }
  };

  const handleSave = (e) => {
    e.preventDefault();
    setSaved(true);
  };

  const Toggle = ({ checked, onChange, label, description }) => (
    
    <div className="flex items-center justify-between gap-4 py-4">
      <div>
        <p className="text-sm font-semibold text-slate-800">{label}</p>
        {description && (
          <p className="mt-1 text-sm text-slate-500">{description}</p>
        )}
      </div>

      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        onClick={() => onChange(!checked)}
        className={`relative h-7 w-12 shrink-0 rounded-full transition-colors duration-300 ease-in-out ${
          checked ? "bg-indigo-600" : "bg-slate-300"
        }`}
      >
        <span
          className={`absolute left-1 top-1 h-5 w-5 rounded-full bg-white shadow-md transition-all duration-300 ease-[cubic-bezier(0.34,1.56,0.64,1)] ${
            checked ? "translate-x-5 scale-105" : "translate-x-0 scale-100"
          }`}
        />
      </button>
    </div>
  );
  return (
    <div className="mx-auto max-w-5xl px-6 py-8">
      {/* Header */}
      <div className="mb-8">
        <div className="mb-2 flex items-center gap-2 text-sm font-medium text-blue-600">
          <User size={17} />
          Account Preferences
        </div>

        <h1 className="text-3xl font-bold text-slate-900">Settings</h1>

        <p className="mt-2 text-slate-500">
          Manage your account, shopping and security preferences.
        </p>
      </div>

      {/* Demo Notice */}
      <div className="mb-7 flex gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4">
        <Info size={20} className="mt-0.5 shrink-0 text-amber-600" />
        <div>
          <h3 className="font-semibold text-amber-900">Frontend preview</h3>
          <p className="mt-1 text-sm text-amber-800">
            Settings are currently stored in page state only. Backend
            persistence and account authentication will be added later.
          </p>
        </div>
      </div>

      <form onSubmit={handleSave} className="space-y-6">
        {/* Profile */}
        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="mb-6 flex items-center gap-3">
            <div className="rounded-xl bg-blue-50 p-3">
              <UserRound size={22} className="text-blue-600" />
            </div>
            <div>
              <h2 className="font-bold text-slate-900">Profile Settings</h2>
              <p className="text-sm text-slate-500">
                Manage your basic account information.
              </p>
            </div>
          </div>

          <div className="grid gap-5 sm:grid-cols-2">
            <div>
              <label className="mb-2 block text-sm font-medium text-slate-700">
                Full Name
              </label>
              <input
                type="text"
                value={profile.name}
                onChange={(e) => updateProfile("name", e.target.value)}
                placeholder="Enter your name"
                className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-slate-700">
                Email Address
              </label>
              <div className="relative">
                <Mail
                  size={17}
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                />
                <input
                  type="email"
                  value={profile.email}
                  onChange={(e) => updateProfile("email", e.target.value)}
                  placeholder="Enter your email"
                  className="w-full rounded-xl border border-slate-200 py-3 pl-10 pr-4 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                />
              </div>
            </div>
          </div>
        </section>

        {/* Shopping Preferences */}
        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="mb-6 flex items-center gap-3">
            <div className="rounded-xl bg-purple-50 p-3">
              <ShoppingBag size={22} className="text-purple-600" />
            </div>
            <div>
              <h2 className="font-bold text-slate-900">
                Shopping Preferences
              </h2>
              <p className="text-sm text-slate-500">
                Set your default shopping limits.
              </p>
            </div>
          </div>

          <div className="grid gap-5 sm:grid-cols-2">
            <div>
              <label className="mb-2 block text-sm font-medium text-slate-700">
                Default Shopping Budget
              </label>
              <div className="relative">
                <DollarSign
                  size={17}
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                />
                <input
                  type="number"
                  min="0"
                  value={budget}
                  onChange={(e) => {
                    setBudget(e.target.value);
                    setSaved(false);
                  }}
                  className="w-full rounded-xl border border-slate-200 py-3 pl-10 pr-4 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                />
              </div>
              <p className="mt-2 text-xs text-slate-400">
                Used as your default budget for shopping requests.
              </p>
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-slate-700">
                Currency
              </label>
              <select
                value={currency}
                onChange={(e) => {
                  setCurrency(e.target.value);
                  setSaved(false);
                }}
                className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none focus:border-blue-400"
              >
                <option value="USD">USD - US Dollar ($)</option>
                <option value="INR">INR - Indian Rupee (₹)</option>
                <option value="EUR">EUR - Euro (€)</option>
                <option value="NPR">NPR - Nepalese Rupee (रु)</option>
              </select>
            </div>
          </div>
        </section>

        {/* Security Preferences */}
        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="mb-4 flex items-center gap-3">
            <div className="rounded-xl bg-indigo-50 p-3">
              <div
                onAnimationEnd={() => setShieldPulse(false)}
                className={shieldPulse ? "shield-pulse" : ""}
              >
                <ShieldCheck size={22} className="text-indigo-600" />
              </div>
            </div>
            <div>
              <h2 className="font-bold text-slate-900">
                Security Preferences
              </h2>
              <p className="text-sm text-slate-500">
                Configure your purchase protection preferences.
              </p>
            </div>
          </div>

          <div className="divide-y divide-slate-100">
            
            <Toggle
              label="Strict Mode"
              description="Apply stricter security rules before allowing purchases."
              checked={strictMode}
              onChange={(value) =>
                handleSecurityToggle(setStrictMode, value)
              }
            />

            <Toggle
              label="Auto-block suspicious prices"
              description="Automatically block purchases when prices trigger suspicious-price rules."
              checked={autoBlockPrices}
              onChange={(value) =>
                handleSecurityToggle(setAutoBlockPrices, value)
              }
            />

            <Toggle
              label="Require purchase confirmation"
              description="Require explicit user approval before a purchase."
              checked={security.confirmPurchase}
              onChange={(value) =>
                updateToggle(setSecurity, "confirmPurchase", value)
              }
            />

            <Toggle
              label="Block unverified merchants"
              description="Reject merchants that fail required trust checks."
              checked={security.blockUnverifiedMerchants}
              onChange={(value) =>
                updateToggle(setSecurity, "blockUnverifiedMerchants", value)
              }
            />

            <Toggle
              label="Detect hidden subscriptions"
              description="Check for recurring charges and subscription terms."
              checked={security.detectSubscriptions}
              onChange={(value) =>
                updateToggle(setSecurity, "detectSubscriptions", value)
              }
            />

            <Toggle
              label="Prompt injection protection"
              description="Scan untrusted product content for malicious instructions."
              checked={security.promptInjectionProtection}
              onChange={(value) =>
                updateToggle(setSecurity, "promptInjectionProtection", value)
              }
            />
          </div>
        </section>

        {/* Notifications */}
        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="mb-4 flex items-center gap-3">
            <div className="rounded-xl bg-orange-50 p-3">
              <Bell size={22} className="text-orange-600" />
            </div>
            <div>
              <h2 className="font-bold text-slate-900">Notifications</h2>
              <p className="text-sm text-slate-500">
                Choose which updates you want to receive.
              </p>
            </div>
          </div>

          <div className="divide-y divide-slate-100">
            <Toggle
              label="Payment alerts"
              description="Get updates when a payment is approved or completed."
              checked={notifications.paymentAlerts}
              onChange={(value) =>
                updateToggle(setNotifications, "paymentAlerts", value)
              }
            />

            <Toggle
              label="Security alerts"
              description="Get notified about suspicious activity or blocked purchases."
              checked={notifications.securityAlerts}
              onChange={(value) =>
                updateToggle(setNotifications, "securityAlerts", value)
              }
            />

            <Toggle
              label="Transaction updates"
              description="Receive updates about pending and completed transactions."
              checked={notifications.transactionUpdates}
              onChange={(value) =>
                updateToggle(setNotifications, "transactionUpdates", value)
              }
            />

            <Toggle
              label="Product updates"
              description="Receive optional updates about shopping recommendations."
              checked={notifications.productUpdates}
              onChange={(value) =>
                updateToggle(setNotifications, "productUpdates", value)
              }
            />
          </div>
        </section>

        {/* Privacy */}
        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="mb-4 flex items-center gap-3">
            <div className="rounded-xl bg-slate-100 p-3">
              <LockKeyhole size={22} className="text-slate-700" />
            </div>
            <div>
              <h2 className="font-bold text-slate-900">Privacy Settings</h2>
              <p className="text-sm text-slate-500">
                Manage your shopping data preferences.
              </p>
            </div>
          </div>

          <div className="divide-y divide-slate-100">
            <Toggle
              label="Save shopping history"
              description="Allow your purchase history to be retained."
              checked={privacy.saveShoppingHistory}
              onChange={(value) =>
                updateToggle(setPrivacy, "saveShoppingHistory", value)
              }
            />

            <Toggle
              label="Save security logs"
              description="Keep records of security checks and decisions."
              checked={privacy.saveSecurityLogs}
              onChange={(value) =>
                updateToggle(setPrivacy, "saveSecurityLogs", value)
              }
            />
          </div>
        </section>

        {/* Save Button */}
        <div className="flex flex-col items-start justify-between gap-4 rounded-2xl border border-slate-200 bg-white p-5 sm:flex-row sm:items-center">
          <div>
            <p className="font-semibold text-slate-900">
              Save your preferences
            </p>
            <p className="mt-1 text-sm text-slate-500">
              Apply your changes in this frontend preview.
            </p>
          </div>

          <button
            type="submit"
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-6 py-3 font-semibold text-white transition hover:bg-blue-700 sm:w-auto"
          >
            <Save size={18} />
            Save Changes
          </button>
        </div>

        {saved && (
          <div className="flex items-center gap-2 rounded-xl border border-green-200 bg-green-50 p-4 text-sm font-medium text-green-700">
            <CheckCircle2 size={19} />
            Preferences saved in the current page session.
          </div>
        )}
      </form>
    </div>
  );
}

export default Settings;
