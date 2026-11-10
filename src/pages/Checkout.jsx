
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  ShieldCheck,
  LockKeyhole,
  ShoppingBag,
  Store,
  CreditCard,
  CheckCircle2,
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  IndianRupee,
  Info,
  Sparkles,
  ScanLine,
  RefreshCw,
} from "lucide-react";

function Checkout() {
  const navigate = useNavigate();

  const [authorized, setAuthorized] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [scanResult, setScanResult] = useState(null);
  const [demoOutcome, setDemoOutcome] = useState("approved");

  // Temporary demonstration order
  const order = {
    productName: "Selected Product",
    description: "Your selected shopping item",
    merchant: "Merchant details pending",
    price: 0,
    shipping: 0,
    total: 0,
  };

  const runSecurityScan = () => {
    if (scanning) return;

    setScanning(true);
    setScanResult(null);
    setAuthorized(false);

    // Demonstration only. Replace with the real security API later.
    setTimeout(() => {
      setScanning(false);
      setScanResult(demoOutcome);
    }, 2500);
  };

  const handleAuthorization = () => {
    if (!authorized || scanResult !== "approved") return;

    alert(
      "Demo authorization successful. Actual PayPal payment integration is pending."
    );
  };

  const resetScan = () => {
    setScanning(false);
    setScanResult(null);
    setAuthorized(false);
  };

  return (
    <div className="mx-auto max-w-7xl px-6 py-8">

      {/* Header */}
      <div className="mb-7">
        <button
          onClick={() => navigate(-1)}
          className="mb-5 flex items-center gap-2 text-sm font-medium text-slate-500 hover:text-indigo-600"
        >
          <ArrowLeft size={17} />
          Back
        </button>

        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="mb-2 flex items-center gap-2 text-sm font-medium text-indigo-600">
              <LockKeyhole size={17} />
              IntentLock Protected Payment
            </div>

            <h1 className="text-3xl font-bold text-slate-900">
              Secure Checkout
            </h1>

            <p className="mt-2 text-slate-500">
              Verify your purchase before authorizing payment.
            </p>
          </div>

          <div className="flex items-center gap-2 rounded-xl border border-green-200 bg-green-50 px-4 py-3">
            <ShieldCheck size={20} className="text-green-600" />
            <span className="text-sm font-semibold text-green-700">
              Protected Checkout
            </span>
          </div>
        </div>
      </div>

      {/* Demo Notice */}
      <div className="mb-7 flex gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4">
        <Info size={20} className="mt-0.5 shrink-0 text-amber-600" />
        <div>
          <h3 className="font-semibold text-amber-900">
            Security scan demonstration
          </h3>
          <p className="mt-1 text-sm text-amber-800">
            The scan results below are simulated for the frontend demo.
            Actual security decisions must come from the backend security engine.
          </p>
        </div>
      </div>

      <div className="grid gap-7 lg:grid-cols-3">

        {/* Left column */}
        <div className="space-y-6 lg:col-span-2">

          {/* Order Summary */}
          <section className="card rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="mb-5 flex items-center gap-3">
              <div className="rounded-xl bg-indigo-50 p-3">
                <ShoppingBag size={22} className="text-indigo-600" />
              </div>

              <div>
                <h2 className="text-lg font-bold text-slate-900">
                  Order Summary
                </h2>
                <p className="text-sm text-slate-500">
                  Review your selected product.
                </p>
              </div>
            </div>

            <div className="flex flex-col gap-4 rounded-xl border border-slate-100 bg-slate-50 p-4 sm:flex-row sm:items-center">
              <div className="flex h-24 w-24 shrink-0 items-center justify-center rounded-xl bg-indigo-100">
                <ShoppingBag size={36} className="text-indigo-600" />
              </div>

              <div className="flex-1">
                <h3 className="font-semibold text-slate-900">
                  {order.productName}
                </h3>
                <p className="mt-1 text-sm text-slate-500">
                  {order.description}
                </p>
                <div className="mt-3 flex items-center gap-2 text-sm text-slate-500">
                  <Store size={15} />
                  {order.merchant}
                </div>
              </div>

              <div className="font-bold text-slate-900">
                ₹{order.price.toLocaleString("en-IN")}
              </div>
            </div>

            <div className="mt-5 space-y-3">
              <div className="flex justify-between text-sm text-slate-600">
                <span>Product price</span>
                <span>₹{order.price.toLocaleString("en-IN")}</span>
              </div>

              <div className="flex justify-between text-sm text-slate-600">
                <span>Shipping</span>
                <span>₹{order.shipping.toLocaleString("en-IN")}</span>
              </div>

              <div className="border-t border-slate-200 pt-4">
                <div className="flex justify-between">
                  <span className="font-bold text-slate-900">
                    Total Amount
                  </span>
                  <span className="text-xl font-bold text-slate-900">
                    ₹{order.total.toLocaleString("en-IN")}
                  </span>
                </div>
              </div>
            </div>
          </section>

          {/* Security Scanner */}
          <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex items-center gap-3">
              <div className="rounded-xl bg-indigo-50 p-3">
                <ShieldCheck size={23} className="text-indigo-600" />
              </div>

              <div>
                <h2 className="text-lg font-bold text-slate-900">
                  IntentLock Security Scanner
                </h2>
                <p className="text-sm text-slate-500">
                  Five-layer purchase verification
                </p>
              </div>
            </div>

            {/* Scanner animation */}
            <div className="my-7 flex flex-col items-center rounded-2xl bg-slate-50 px-5 py-8">

              <div
                className={`relative flex h-36 w-36 items-center justify-center rounded-full border-2 ${
                  scanning
                    ? "scanner-active border-indigo-400 bg-indigo-50"
                    : scanResult === "approved"
                    ? "scan-approved border-green-300 bg-green-50"
                    : scanResult === "blocked"
                    ? "scan-blocked border-red-300 bg-red-50"
                    : "border-slate-200 bg-white"
                }`}
              >
                {scanning ? (
                  <>
                    <ShieldCheck size={65} className="text-indigo-600" />
                    <div className="scanner-line" />
                  </>
                ) : scanResult === "approved" ? (
                  <>
                    <ShieldCheck size={65} className="text-green-600" />
                    <span className="absolute -right-1 -top-1 rounded-full bg-green-500 p-1.5 text-white">
                      <CheckCircle2 size={20} />
                    </span>
                    <Sparkles className="sparkle-one absolute -right-6 top-4 text-amber-400" size={20} />
                    <Sparkles className="sparkle-two absolute -left-5 bottom-4 text-green-500" size={17} />
                  </>
                ) : scanResult === "blocked" ? (
                  <>
                    <ShieldCheck size={65} className="text-red-600" />
                    <span className="absolute -right-1 -top-1 rounded-full bg-red-500 p-1.5 text-white">
                      <AlertTriangle size={20} />
                    </span>
                  </>
                ) : (
                  <ShieldCheck size={65} className="text-slate-300" />
                )}
              </div>

              <h3 className="mt-6 text-lg font-bold text-slate-900">
                {scanning
                  ? "Scanning your purchase..."
                  : scanResult === "approved"
                  ? "Security Verification Passed!"
                  : scanResult === "blocked"
                  ? "Purchase Blocked!"
                  : "Ready to Verify"}
              </h3>

              <p className="mt-2 max-w-md text-center text-sm text-slate-500">
                {scanning
                  ? "Analyzing product, price, merchant, subscriptions and suspicious instructions."
                  : scanResult === "approved"
                  ? "The simulated security scan approved this purchase."
                  : scanResult === "blocked"
                  ? "The simulated security scan detected a suspicious purchase. Payment authorization is disabled."
                  : "Run a security scan before authorizing your purchase."}
              </p>

              {scanning && (
                <div className="mt-5 w-full max-w-xs">
                  <div className="h-2 overflow-hidden rounded-full bg-indigo-100">
                    <div className="scanner-progress h-full rounded-full bg-indigo-600" />
                  </div>
                  <p className="mt-2 text-center text-xs font-medium text-indigo-600">
                    Verifying security layers
                  </p>
                </div>
              )}

              {scanResult === "approved" && (
                <span className="mt-4 rounded-full bg-green-100 px-4 py-2 text-xs font-bold text-green-700">
                  ALL DEMO CHECKS PASSED
                </span>
              )}

              {scanResult === "blocked" && (
                <span className="mt-4 rounded-full bg-red-100 px-4 py-2 text-xs font-bold text-red-700">
                  SECURITY RISK DETECTED — DEMO
                </span>
              )}
            </div>

            {/* Demo outcome selector */}
            <div className="mb-5 rounded-xl border border-slate-200 p-4">
              <label className="mb-2 block text-sm font-semibold text-slate-700">
                Demo scan outcome
              </label>

              <select
                value={demoOutcome}
                onChange={(e) => {
                  setDemoOutcome(e.target.value);
                  resetScan();
                }}
                disabled={scanning}
                className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none focus:border-indigo-400"
              >
                <option value="approved">Approved — simulate a safe purchase</option>
                <option value="blocked">Blocked — simulate a suspicious purchase</option>
              </select>

              <p className="mt-2 text-xs text-slate-400">
                For demonstration and testing only. This selector does not determine real security decisions.
              </p>
            </div>

            {/* Scanner button */}
            <button
              onClick={runSecurityScan}
              disabled={scanning}
              className="gradient-button flex w-full items-center justify-center gap-2 rounded-xl px-5 py-3 font-semibold disabled:opacity-60"
            >
              {scanning ? (
                <>
                  <RefreshCw size={18} className="animate-spin" />
                  Scanning...
                </>
              ) : (
                <>
                  <ScanLine size={18} />
                  {scanResult ? "Run Scan Again" : "Run Security Scan"}
                </>
              )}
            </button>

            {/* Five verification layers */}
            <div className="mt-7 space-y-4">
              <h3 className="font-semibold text-slate-900">
                Verification Layers
              </h3>

              {[
                "Product Verification",
                "Price Verification",
                "Merchant Verification",
                "Subscription Detection",
                "Prompt Injection Detection",
              ].map((item, index) => (
                <div key={item} className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-slate-100 text-xs font-bold text-slate-600">
                      {index + 1}
                    </span>
                    <span className="text-sm text-slate-600">{item}</span>
                  </div>

                  <span
                    className={`text-xs font-semibold ${
                      scanning
                        ? "text-indigo-600"
                        : scanResult === "approved"
                        ? "text-green-600"
                        : scanResult === "blocked" && index === 1
                        ? "text-red-600"
                        : "text-slate-400"
                    }`}
                  >
                    {scanning
                      ? "Scanning"
                      : scanResult === "approved"
                      ? "Passed"
                      : scanResult === "blocked" && index === 1
                      ? "Failed"
                      : scanResult === "blocked"
                      ? "Not cleared"
                      : "Not checked"}
                  </span>
                </div>
              ))}
            </div>
          </section>
        </div>

        {/* Right column */}
        <div className="space-y-6">

          {/* Payment Method */}
          <section className="card rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="mb-5 flex items-center gap-3">
              <div className="rounded-xl bg-indigo-50 p-3">
                <CreditCard size={22} className="text-indigo-600" />
              </div>

              <div>
                <h2 className="font-bold text-slate-900">
                  Payment Method
                </h2>
                <p className="text-sm text-slate-500">
                  Sandbox payment gateway
                </p>
              </div>
            </div>

            <div className="rounded-xl border border-indigo-200 bg-indigo-50 p-4">
              <div className="flex items-center justify-between">
                <span className="font-bold text-indigo-800">
                  PayPal Sandbox
                </span>
                <span className="rounded-full bg-indigo-100 px-2 py-1 text-xs font-semibold text-indigo-700">
                  TEST MODE
                </span>
              </div>

              <p className="mt-2 text-sm text-indigo-700">
                PayPal integration will be connected later.
              </p>
            </div>
          </section>

          {/* Authorization */}
          <section className="card rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="mb-4 font-bold text-slate-900">
              Your Authorization
            </h2>

            {scanResult === "blocked" ? (
              <div className="rounded-xl border border-red-200 bg-red-50 p-4">
                <div className="flex items-center gap-2 font-semibold text-red-700">
                  <AlertTriangle size={19} />
                  Authorization blocked
                </div>
                <p className="mt-2 text-sm leading-6 text-red-600">
                  This purchase did not pass the demo security scan. Payment authorization is unavailable.
                </p>
              </div>
            ) : scanResult !== "approved" ? (
              <p className="text-sm leading-6 text-slate-500">
                Complete the security scan successfully before you can authorize payment.
              </p>
            ) : (
              <>
                <label className="flex cursor-pointer items-start gap-3">
                  <input
                    type="checkbox"
                    checked={authorized}
                    onChange={(e) => setAuthorized(e.target.checked)}
                    className="mt-1 h-4 w-4 accent-indigo-600"
                  />

                  <span className="text-sm leading-6 text-slate-600">
                    I have reviewed the product, merchant, price and order details. I authorize this purchase.
                  </span>
                </label>

                <button
                  onClick={handleAuthorization}
                  disabled={!authorized}
                  className="gradient-button mt-6 flex w-full items-center justify-center gap-2 rounded-xl px-5 py-3 font-semibold disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <LockKeyhole size={18} />
                  Authorize Payment
                </button>
              </>
            )}

            <p className="mt-4 text-center text-xs text-slate-400">
              <LockKeyhole size={12} className="mr-1 inline" />
              No real payment is processed in this preview.
            </p>
          </section>

          {/* Protection */}
          <div className="card rounded-2xl border border-green-200 bg-green-50 p-5">
            <div className="flex items-center gap-2 text-green-700">
              <CheckCircle2 size={20} />
              <h3 className="font-bold">User-controlled payments</h3>
            </div>

            <p className="mt-2 text-sm leading-6 text-green-800">
              IntentLock is designed to keep the user in control of every purchase authorization.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

export default Checkout;
