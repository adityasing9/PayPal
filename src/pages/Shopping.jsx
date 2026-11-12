import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Bot,
  Send,
  Sparkles,
  ShoppingBag,
  Search,
  ShieldCheck,
  CheckCircle2,
  ArrowRight,
  RotateCcw,
} from "lucide-react";

import { useToast } from "../context/ToastContext";
import { createIntent, getProducts, ensureDemoSession } from "../api/client";

// Verified catalog items used as fallback / reference from data/catalog_fixture.json
const defaultCatalogItems = [
  {
    id: "prod_k2_pro",
    externalId: "prod_k2_pro",
    name: "Keychron K2 Pro Wireless Mechanical Keyboard",
    brand: "Keychron",
    price: 99.00,
    priceMinor: "9900",
    shippingMinor: "1000",
    taxMinor: "890",
    totalPriceMinor: "11790",
    currency: "USD",
    category: "Keyboards",
    specs: {
      switchType: "Tactile (Brown)",
      connectivity: "Wireless Bluetooth 5.1 / Type-C",
      formFactor: "75%",
      backlight: "White LED"
    },
    image: "⌨️",
    merchant: "Keychron Official Store",
    paypalMerchantId: "PPM_KEYCHRON_998",
    match: 100,
    suitable: true,
  },
  {
    id: "prod_logi_mx_mech",
    externalId: "prod_logi_mx_mech",
    name: "Logitech MX Mechanical Wireless Keyboard",
    brand: "Logitech",
    price: 169.99,
    priceMinor: "16999",
    shippingMinor: "1000",
    taxMinor: "1530",
    totalPriceMinor: "19529",
    currency: "USD",
    category: "Keyboards",
    specs: {
      switchType: "Tactile Quiet",
      connectivity: "Logi Bolt / Bluetooth",
      formFactor: "Full Size",
      backlight: "White LED"
    },
    image: "⌨️",
    merchant: "Logitech Official",
    paypalMerchantId: "PPM_LOGITECH_441",
    match: 85,
    suitable: false,
  },
  {
    id: "prod_ath_m50xbt2",
    externalId: "prod_ath_m50xbt2",
    name: "Audio-Technica ATH-M50xBT2 Wireless Headphones",
    brand: "Audio-Technica",
    price: 199.00,
    priceMinor: "19900",
    shippingMinor: "1200",
    taxMinor: "1790",
    totalPriceMinor: "22890",
    currency: "USD",
    category: "Headphones",
    specs: {
      driver: "45mm large-aperture",
      connectivity: "Bluetooth 5.0 / 3.5mm",
      batteryLife: "50 hours",
      voiceAssistant: "Built-in Alexa"
    },
    image: "🎧",
    merchant: "Audio-Technica Direct",
    paypalMerchantId: "PPM_AUDIO_552",
    match: 95,
    suitable: true,
  },
];

function Shopping() {
  const navigate = useNavigate();
  const { showToast } = useToast();

  const [request, setRequest] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [products, setProducts] = useState(defaultCatalogItems);
  const [activeIntent, setActiveIntent] = useState(null);

  const [messages, setMessages] = useState([
    {
      type: "assistant",
      text: "Hello! I'm IntentLock AI. Tell me what product you're looking for, your budget, and preferences. I'll search the verified catalog and prepare security-compliant proposals.",
    },
  ]);

  // Ensure active session on component mount
  useEffect(() => {
    ensureDemoSession().catch(() => {});
  }, []);

  // Handle shopping search
  const handleSearch = async (e, customPrompt = null, customBudgetMinor = "12000", customSpecs = {}) => {
    if (e) e.preventDefault();
    const promptText = (customPrompt || request).trim();
    if (!promptText || loading) return;

    setMessages((prev) => [
      ...prev,
      { type: "user", text: promptText },
      {
        type: "assistant",
        animated: true,
        text: `Analyzing your shopping request for "${promptText}" within budget. Querying verified merchant catalog...`,
      },
    ]);

    setLoading(true);
    setSubmitted(false);
    setSelectedProduct(null);
    showToast("Querying verified catalog via IntentLock backend...", "info");

    try {
      await ensureDemoSession();

      // 1. Submit intent to backend
      const intentRes = await createIntent({
        prompt: promptText,
        maxBudgetMinor: customBudgetMinor,
        currency: "USD",
        category: "Keyboards",
        constraints: {
          requiredSpecs: customSpecs.switchType ? { switchType: customSpecs.switchType } : { switchType: "Tactile" }
        }
      });

      const intentData = intentRes.intent || intentRes;
      setActiveIntent(intentData);

      // 2. Fetch products from catalog
      try {
        const prodRes = await getProducts("Keyboards");
        if (prodRes && prodRes.products && prodRes.products.length > 0) {
          const mapped = prodRes.products.map((p) => {
            const priceNum = Number(p.basePriceMinor) / 100;
            const isUnderBudget = BigInt(p.basePriceMinor) <= BigInt(customBudgetMinor);
            return {
              id: p.externalId,
              externalId: p.externalId,
              name: p.title,
              brand: p.title.split(" ")[0] || "Verified",
              price: priceNum,
              priceMinor: p.basePriceMinor,
              shippingMinor: "1000",
              taxMinor: (Number(p.basePriceMinor) * 0.09).toFixed(0),
              totalPriceMinor: (BigInt(p.basePriceMinor) + 1000n + BigInt((Number(p.basePriceMinor) * 0.09).toFixed(0))).toString(),
              currency: p.currency || "USD",
              category: p.category,
              specs: p.specifications || {},
              image: p.category === "Headphones" ? "🎧" : p.category === "Monitors" ? "🖥️" : "⌨️",
              merchant: p.merchantName || "Verified Store",
              paypalMerchantId: p.paypalMerchantId,
              match: isUnderBudget ? 100 : 75,
              suitable: isUnderBudget
            };
          });
          setProducts(mapped);
        }
      } catch {
        // Fallback to default catalog items if offline
      }

      setSubmitted(true);
      showToast("Verified catalog proposals ready for inspection!", "success");
    } catch (err) {
      console.warn("Backend intent error, using offline catalog:", err);
      // Fallback intent for local demo
      setActiveIntent({
        _id: "int_local_" + Date.now(),
        intentId: "int_demo_001",
        version: 1,
        maxBudgetMinor: customBudgetMinor,
        currency: "USD",
        requiredSpecs: customSpecs.switchType ? { switchType: customSpecs.switchType } : { switchType: "Tactile" }
      });
      setSubmitted(true);
      showToast("Catalog loaded in local demonstration mode", "info");
    } finally {
      setLoading(false);
      setRequest("");
    }
  };

  // Preset Demo Scenarios
  const runScenario = (scenarioType) => {
    if (scenarioType === "pass") {
      handleSearch(null, "Find me a wireless mechanical keyboard under $120 with tactile switches", "12000", { switchType: "Tactile" });
    } else if (scenarioType === "review") {
      handleSearch(null, "Find me a wireless mechanical keyboard under $120 with linear switches", "12000", { switchType: "Linear" });
    } else if (scenarioType === "block") {
      handleSearch(null, "Find me a high-end mechanical keyboard under $50", "5000", { switchType: "Tactile" });
    }
  };

  // Reset conversation
  const handleReset = () => {
    setSubmitted(false);
    setLoading(false);
    setSelectedProduct(null);
    setProducts(defaultCatalogItems);
    setActiveIntent(null);
    setMessages([
      {
        type: "assistant",
        text: "Hello! I'm IntentLock AI. Tell me what product you're looking for, your budget, and preferences.",
      },
    ]);
    showToast("Shopping conversation reset.", "info");
  };

  // Select product
  const handleSelectProduct = (product) => {
    setSelectedProduct(product);
    showToast(`${product.name} selected for security inspection!`, "success");
  };

  // Verify purchase -> navigate to /checkout
  const handleVerifyPurchase = () => {
    if (!selectedProduct) return;
    navigate("/checkout", {
      state: {
        product: selectedProduct,
        intent: activeIntent || {
          _id: "int_default_01",
          intentId: "int_default_01",
          version: 1,
          maxBudgetMinor: "12000",
          currency: "USD",
          requiredSpecs: { switchType: "Tactile" }
        }
      }
    });
  };

  return (
    <div className="min-h-screen bg-[#F8FAFC] p-5 md:p-8">
      {/* Page Header */}
      <div className="mb-7 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold text-slate-900">
              AI Shopping Assistant
            </h1>
            <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-medium text-blue-700">
              AI Powered + Firewall Protected
            </span>
          </div>
          <p className="mt-1 text-sm text-slate-500">
            Natural-language discovery backed by deterministic payment firewall validation.
          </p>
        </div>

        <button
          type="button"
          onClick={handleReset}
          className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-600 hover:bg-slate-50"
        >
          <RotateCcw size={16} />
          New Search
        </button>
      </div>

      {/* Main Layout */}
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        {/* Chat Section */}
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm xl:col-span-2">
          {/* Chat Header */}
          <div className="flex items-center justify-between border-b border-slate-100 p-5">
            <div className="flex items-center gap-3">
              <div className="rounded-xl bg-blue-600 p-3 text-white">
                <Bot size={23} />
              </div>
              <div>
                <h2 className="font-semibold text-slate-900">IntentLock AI Agent</h2>
                <p className="mt-1 text-xs text-green-600">● Connected to verified catalog</p>
              </div>
            </div>
            <Sparkles className="text-blue-500" size={22} />
          </div>

          {/* Chat Messages */}
          <div className="max-h-[470px] min-h-[300px] space-y-5 overflow-y-auto p-5">
            {messages.map((message, index) => (
              <div
                key={index}
                className={`flex gap-3 ${message.type === "user" ? "justify-end" : "justify-start"}`}
              >
                {message.type === "assistant" && (
                  <div className="h-fit rounded-lg bg-blue-50 p-2 text-blue-600">
                    <Bot size={19} />
                  </div>
                )}
                <div
                  className={`max-w-[85%] rounded-2xl p-4 text-sm leading-relaxed ${
                    message.type === "user"
                      ? "bg-blue-600 text-white"
                      : "border border-slate-100 bg-slate-50 text-slate-700"
                  }`}
                >
                  {message.text}
                </div>
              </div>
            ))}

            {loading && (
              <div className="flex items-center gap-3 text-sm text-slate-500">
                <Sparkles size={18} className="animate-pulse text-blue-600" />
                Querying verified catalog and verifying security constraints...
              </div>
            )}
          </div>

          {/* Preset Hackathon Test Scenarios */}
          {!submitted && (
            <div className="border-t border-slate-100 bg-slate-50 px-5 py-3">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">
                Quick Hackathon Demo Scenarios
              </p>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => runScenario("pass")}
                  className="rounded-lg border border-green-200 bg-green-50 px-3 py-1.5 text-xs font-semibold text-green-800 transition hover:bg-green-100"
                >
                  🟢 Scenario 1: Happy Path ($120 Tactile Keyboard &rarr; PASS)
                </button>
                <button
                  type="button"
                  onClick={() => runScenario("review")}
                  className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-800 transition hover:bg-amber-100"
                >
                  🟡 Scenario 2: Spec Diff (Linear Request vs Tactile &rarr; REVIEW)
                </button>
                <button
                  type="button"
                  onClick={() => runScenario("block")}
                  className="rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-semibold text-red-800 transition hover:bg-red-100"
                >
                  🔴 Scenario 3: Budget Overrun ($50 Ceiling &rarr; BLOCK)
                </button>
              </div>
            </div>
          )}

          {/* Chat Input */}
          <form onSubmit={handleSearch} className="border-t border-slate-100 p-5">
            <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 p-2">
              <Search className="ml-2 text-slate-400" size={20} />
              <input
                value={request}
                onChange={(e) => setRequest(e.target.value)}
                placeholder="Describe your purchase (e.g. Wireless mechanical keyboard under $120)..."
                className="min-w-0 flex-1 bg-transparent py-2 text-sm text-slate-800 outline-none placeholder:text-slate-400"
              />
              <button
                type="submit"
                disabled={!request.trim() || loading}
                className="rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:opacity-50"
              >
                <Send size={16} />
              </button>
            </div>
          </form>
        </div>

        {/* Intent Constraints Summary */}
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex items-center gap-3 border-b border-slate-100 pb-4">
            <div className="rounded-xl bg-blue-50 p-2.5 text-blue-600">
              <ShieldCheck size={22} />
            </div>
            <div>
              <h2 className="font-semibold text-slate-900">Extracted Constraints</h2>
              <p className="text-xs text-slate-500">Bound to security firewall</p>
            </div>
          </div>

          <div className="mt-5 space-y-4">
            <div className="rounded-xl border border-slate-100 bg-slate-50 p-4">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">Budget Ceiling</span>
              <p className="mt-1 text-lg font-bold text-slate-900">
                ${activeIntent ? (Number(activeIntent.maxBudgetMinor) / 100).toFixed(2) : "120.00"} USD
              </p>
            </div>

            <div className="rounded-xl border border-slate-100 bg-slate-50 p-4">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">Required Specs</span>
              <p className="mt-1 text-sm font-medium text-slate-800">
                Switch: {activeIntent?.requiredSpecs?.switchType || "Tactile"}
              </p>
              <p className="text-xs text-slate-500">Connectivity: Wireless / Bluetooth</p>
            </div>

            <div className="rounded-xl border border-slate-100 bg-slate-50 p-4">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">Payee Protection</span>
              <p className="mt-1 text-xs text-green-700 font-medium">● Whitelisted merchants only</p>
              <p className="text-xs text-slate-500">Recurring fees strictly blocked</p>
            </div>
          </div>
        </div>
      </div>

      {/* Recommended Products Grid */}
      {submitted && (
        <div className="mt-8">
          <div className="mb-5 flex items-center justify-between">
            <h2 className="text-xl font-bold text-slate-900">AI Proposed Catalog Matches</h2>
            <div className="flex items-center gap-2 text-sm text-slate-500">
              <ShoppingBag size={17} />
              {products.length} products found
            </div>
          </div>

          <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
            {products.map((product) => (
              <div
                key={product.id}
                className={`rounded-2xl border bg-white p-5 shadow-sm transition ${
                  selectedProduct?.id === product.id
                    ? "border-blue-500 ring-2 ring-blue-100"
                    : "border-slate-200 hover:shadow-md"
                }`}
              >
                <div className="mb-4 flex h-36 items-center justify-center rounded-xl bg-slate-50 text-6xl">
                  {product.image}
                </div>

                <div className="mb-2 flex items-center justify-between">
                  <span className="text-xs font-semibold text-slate-500">{product.brand}</span>
                  <span
                    className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                      product.suitable ? "bg-green-50 text-green-700" : "bg-amber-50 text-amber-700"
                    }`}
                  >
                    {product.suitable ? "Within Budget" : "Exceeds Budget"}
                  </span>
                </div>

                <h3 className="text-base font-semibold text-slate-900 line-clamp-1">{product.name}</h3>
                <p className="mt-2 text-2xl font-bold text-slate-900">${product.price.toFixed(2)} USD</p>

                <div className="mt-4 grid grid-cols-2 gap-2 text-xs">
                  <div className="rounded-lg bg-slate-50 p-2.5">
                    <span className="text-slate-400">Switch</span>
                    <p className="font-semibold text-slate-800">{product.specs.switchType || "Standard"}</p>
                  </div>
                  <div className="rounded-lg bg-slate-50 p-2.5">
                    <span className="text-slate-400">Connectivity</span>
                    <p className="font-semibold text-slate-800">{product.specs.connectivity || "Wireless"}</p>
                  </div>
                </div>

                <div className="mt-4 flex items-center gap-2 text-xs text-slate-500">
                  <ShieldCheck size={15} className="text-blue-600" />
                  {product.merchant}
                </div>

                <button
                  type="button"
                  onClick={() => handleSelectProduct(product)}
                  className={`mt-5 flex w-full items-center justify-center gap-2 rounded-xl py-3 text-sm font-semibold transition ${
                    selectedProduct?.id === product.id
                      ? "bg-green-600 text-white"
                      : "bg-blue-600 text-white hover:bg-blue-700"
                  }`}
                >
                  {selectedProduct?.id === product.id ? "Selected for Firewall" : "Select Product"}
                  {selectedProduct?.id === product.id ? <CheckCircle2 size={17} /> : <ArrowRight size={17} />}
                </button>
              </div>
            ))}
          </div>

          {/* Action Bar */}
          {selectedProduct && (
            <div className="mt-6 flex flex-col items-start justify-between gap-4 rounded-2xl border border-blue-200 bg-blue-50 p-6 sm:flex-row sm:items-center">
              <div>
                <h3 className="font-bold text-blue-950 text-lg">
                  {selectedProduct.name} selected
                </h3>
                <p className="mt-1 text-sm text-blue-800">
                  Total: ${(Number(selectedProduct.totalPriceMinor) / 100).toFixed(2)} USD. Ready for independent cryptographic verification.
                </p>
              </div>

              <button
                type="button"
                onClick={handleVerifyPurchase}
                className="flex items-center gap-2 rounded-xl bg-blue-600 px-6 py-3.5 text-sm font-bold text-white shadow-sm transition hover:bg-blue-700"
              >
                <ShieldCheck size={18} />
                Verify Purchase &rarr;
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default Shopping;
