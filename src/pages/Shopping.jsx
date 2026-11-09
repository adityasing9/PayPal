
import { useEffect, useState } from "react";

import {
  Bot,
  Send,
  Sparkles,
  ShoppingBag,
  Search,
  ShieldCheck,
  CheckCircle2,
  SlidersHorizontal,
  ArrowRight,
  Cpu,
  HardDrive,
  MemoryStick,
  Zap,
  IndianRupee,
  RotateCcw,
} from "lucide-react";

import { useToast } from "../context/ToastContext";

const demoProducts = [
  {
    id: 1,
    name: "Gaming Laptop A",
    brand: "ASUS",
    price: 55000,
    ram: "16GB",
    storage: "512GB SSD",
    gpu: "Dedicated GPU",
    image: "💻",
    merchant: "Approved Store",
    match: 100,
    suitable: true,
  },
  {
    id: 2,
    name: "Gaming Laptop B",
    brand: "Lenovo",
    price: 58000,
    ram: "16GB",
    storage: "512GB SSD",
    gpu: "Integrated GPU",
    image: "💻",
    merchant: "Approved Store",
    match: 75,
    suitable: false,
  },
  {
    id: 3,
    name: "Gaming Laptop C",
    brand: "HP",
    price: 62000,
    ram: "16GB",
    storage: "1TB SSD",
    gpu: "Dedicated GPU",
    image: "💻",
    merchant: "Other Store",
    match: 80,
    suitable: false,
  },
];

const initialIntent = {
  budget: "₹60,000",
  ram: "16GB minimum",
  storage: "512GB SSD",
  gpu: "Dedicated GPU",
  subscription: "Not allowed",
  merchant: "Approved merchants only",
};

function Shopping() {
  const { showToast } = useToast();

  const [request, setRequest] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState(null);

  const [messages, setMessages] = useState([
    {
      type: "assistant",
      text: "Hello! I'm IntentLock AI. Tell me what you want to purchase, and I'll help you find products that match your requirements.",
    },
  ]);

  // Handle shopping search
  const handleSearch = (e) => {
    e.preventDefault();

    if (!request.trim() || loading) return;

    const userRequest = request.trim();

    setMessages((prev) => [
      ...prev,
      {
        type: "user",
        text: userRequest,
      },
      {
        type: "assistant",
        animated: true,
        text: "I've received your shopping request. Here are demonstration recommendations. Live AI extraction and product search will be connected through the backend.",
      },
    ]);

    setLoading(true);
    setSubmitted(false);
    setSelectedProduct(null);

    showToast("Searching for suitable products...", "info");

    // Temporary demonstration loading.
    // Replace this with the backend API later.
    setTimeout(() => {
      setSubmitted(true);
      setLoading(false);

      showToast(
        "Demonstration product recommendations are ready!",
        "success"
      );
    }, 1500);

    setRequest("");
  };

  // Fill example request
  const handleExample = () => {
    setRequest(
      "Find me a gaming laptop below ₹60,000 with 16GB RAM, 512GB SSD and a dedicated GPU."
    );
  };

  // Reset conversation
  const handleReset = () => {
    setSubmitted(false);
    setLoading(false);
    setSelectedProduct(null);

    setMessages([
      {
        type: "assistant",
        text: "Hello! I'm IntentLock AI. Tell me what you want to purchase, and I'll help you find products that match your requirements.",
      },
    ]);

    showToast("Shopping conversation has been reset.", "info");
  };

  // Select product
  const handleSelectProduct = (product) => {
    setSelectedProduct(product.id);

    showToast(`${product.name} selected successfully!`, "success");
  };

  // Verify purchase
  const handleVerifyPurchase = () => {
    showToast(
      "Security verification will be connected to the backend.",
      "info"
    );
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
              Beta
            </span>
          </div>

          <p className="mt-1 text-sm text-slate-500">
            Describe what you need. Let IntentLock find suitable products.
          </p>
        </div>

        <button
          type="button"
          title="Start a new shopping conversation"
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
                <h2 className="font-semibold text-slate-900">
                  IntentLock AI
                </h2>

                <p className="mt-1 text-xs text-green-600">
                  ● Shopping assistant ready
                </p>
              </div>
            </div>

            <Sparkles className="text-blue-500" size={22} />
          </div>

          {/* Chat Messages */}
          <div className="max-h-[470px] min-h-[300px] space-y-5 overflow-y-auto p-5">
            {messages.map((message, index) => (
              <div
                key={index}
                className={`flex gap-3 ${
                  message.type === "user"
                    ? "justify-end"
                    : "justify-start"
                }`}
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
                  {message.type === "assistant" && message.animated ? (
                    <TypewriterText text={message.text} />
                  ) : (
                    message.text
                  )}
                </div>
              </div>
            ))}

            {loading && (
              <div className="flex items-center gap-3 text-sm text-slate-500">
                <Sparkles
                  size={18}
                  className="animate-pulse text-blue-600"
                />
                Preparing demonstration recommendations...
              </div>
            )}
          </div>

          {/* Example Request */}
          {!submitted && (
            <div className="px-5 pb-3">
              <p className="mb-2 text-xs text-slate-400">
                TRY AN EXAMPLE
              </p>

              <button
                type="button"
                title="Fill the input with a sample shopping request"
                onClick={handleExample}
                className="rounded-lg border border-blue-100 bg-blue-50 px-3 py-2 text-left text-xs text-blue-700 transition hover:bg-blue-100"
              >
                Find a gaming laptop under ₹60,000
              </button>
            </div>
          )}

          {/* Chat Input */}
          <form
            onSubmit={handleSearch}
            className="border-t border-slate-100 p-5"
          >
            <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 p-2">
              <Search className="ml-2 text-slate-400" size={20} />

              <input
                value={request}
                onChange={(e) => setRequest(e.target.value)}
                placeholder="Describe what you want to purchase..."
                className="min-w-0 flex-1 bg-transparent py-2 text-sm text-slate-800 outline-none placeholder:text-slate-400"
              />

              <button
                type="submit"
                title="Send your shopping request"
                aria-label="Send shopping request"
                disabled={!request.trim() || loading}
                className="rounded-lg bg-blue-600 p-3 text-white transition hover:bg-blue-700 disabled:opacity-40"
              >
                <Send size={18} />
              </button>
            </div>

            <p className="mt-3 text-xs text-slate-400">
              IntentLock checks your purchasing requirements before payment.
            </p>
          </form>
        </div>

        {/* Shopping Intent Summary */}
        <div className="h-fit rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="mb-5 flex items-center gap-3">
            <div className="rounded-lg bg-indigo-50 p-2.5 text-indigo-600">
              <SlidersHorizontal size={21} />
            </div>

            <div>
              <h2 className="font-semibold text-slate-900">
                Shopping Intent
              </h2>

              <p className="mt-1 text-xs text-slate-500">
                Purchasing requirements
              </p>
            </div>
          </div>

          {submitted ? (
            <div className="space-y-4">
              {[
                {
                  label: "Maximum Budget",
                  value: initialIntent.budget,
                  icon: IndianRupee,
                },
                {
                  label: "RAM",
                  value: initialIntent.ram,
                  icon: MemoryStick,
                },
                {
                  label: "Storage",
                  value: initialIntent.storage,
                  icon: HardDrive,
                },
                {
                  label: "GPU",
                  value: initialIntent.gpu,
                  icon: Cpu,
                },
                {
                  label: "Subscription",
                  value: initialIntent.subscription,
                  icon: ShieldCheck,
                },
                {
                  label: "Merchant",
                  value: initialIntent.merchant,
                  icon: ShoppingBag,
                },
              ].map((item) => {
                const Icon = item.icon;

                return (
                  <div
                    key={item.label}
                    className="flex items-start gap-3 border-b border-slate-100 pb-3 last:border-0"
                  >
                    <Icon
                      size={18}
                      className="mt-1 text-slate-400"
                    />

                    <div>
                      <p className="text-xs text-slate-500">
                        {item.label}
                      </p>

                      <p className="mt-1 text-sm font-medium text-slate-800">
                        {item.value}
                      </p>
                    </div>
                  </div>
                );
              })}

              <div className="rounded-lg border border-green-100 bg-green-50 p-3">
                <div className="flex items-center gap-2 text-green-700">
                  <CheckCircle2 size={17} />

                  <span className="text-sm font-semibold">
                    Demo intent loaded
                  </span>
                </div>

                <p className="mt-1 text-xs text-green-700">
                  Requirements shown are fixed demonstration data, not
                  extracted from your message.
                </p>
              </div>
            </div>
          ) : (
            <div className="py-10 text-center">
              <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-slate-50">
                <SlidersHorizontal
                  size={24}
                  className="text-slate-400"
                />
              </div>

              <h3 className="text-sm font-semibold text-slate-800">
                No shopping intent yet
              </h3>

              <p className="mt-2 text-xs leading-relaxed text-slate-500">
                Describe your shopping requirements to see the intent
                summary here.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Product Recommendations */}
      {(loading || submitted) && (
        <div className="mt-8">
          <div className="mb-5 flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
            <div>
              <h2 className="text-xl font-bold text-slate-900">
                Product Recommendations
              </h2>

              <p className="mt-1 text-sm text-slate-500">
                {loading
                  ? "Preparing product recommendations..."
                  : "Demonstration products for your shopping request"}
              </p>
            </div>

            <div className="flex items-center gap-2 text-sm text-slate-500">
              <ShoppingBag size={17} />
              {loading ? "Loading..." : `${demoProducts.length} products`}
            </div>
          </div>

          {loading ? (
            <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
              {Array.from({ length: 3 }).map((_, index) => (
                <ProductCardSkeleton key={index} />
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
              {demoProducts.map((product) => (
                <div
                  key={product.id}
                  className={`card rounded-2xl border bg-white p-5 shadow-sm transition ${
                    selectedProduct === product.id
                      ? "border-blue-500 ring-2 ring-blue-100"
                      : "border-slate-200 hover:shadow-md"
                  }`}
                >
                  <div className="mb-4 flex h-40 items-center justify-center rounded-xl bg-slate-50 text-7xl">
                    {product.image}
                  </div>

                  <div className="mb-2 flex items-center justify-between">
                    <span className="text-xs text-slate-500">
                      {product.brand}
                    </span>

                    <span
                      className={`rounded-full px-2 py-1 text-xs font-semibold ${
                        product.suitable
                          ? "bg-green-50 text-green-700"
                          : "bg-amber-50 text-amber-700"
                      }`}
                    >
                      {product.suitable
                        ? "Matches demo intent"
                        : "Requirement mismatch"}
                    </span>
                  </div>

                  <h3 className="text-base font-semibold text-slate-900">
                    {product.name}
                  </h3>

                  <p className="mt-3 text-2xl font-bold text-slate-900">
                    ₹{product.price.toLocaleString("en-IN")}
                  </p>

                  <div className="mt-4 grid grid-cols-2 gap-3">
                    <Specification
                      icon={MemoryStick}
                      label="RAM"
                      value={product.ram}
                    />

                    <Specification
                      icon={HardDrive}
                      label="Storage"
                      value={product.storage}
                    />

                    <Specification
                      icon={Cpu}
                      label="Graphics"
                      value={product.gpu}
                    />

                    <Specification
                      icon={Zap}
                      label="Match"
                      value={`${product.match}%`}
                    />
                  </div>

                  <div className="mt-4 flex items-center gap-2 text-xs text-slate-500">
                    <ShieldCheck size={15} />
                    {product.merchant}
                  </div>

                  <button
                    type="button"
                    title="Select this product for security verification"
                    onClick={() => handleSelectProduct(product)}
                    className={`mt-5 flex w-full items-center justify-center gap-2 rounded-lg py-3 text-sm font-semibold transition ${
                      selectedProduct === product.id
                        ? "bg-green-600 text-white"
                        : "bg-blue-600 text-white hover:bg-blue-700"
                    }`}
                  >
                    {selectedProduct === product.id
                      ? "Selected"
                      : "Select Product"}

                    {selectedProduct === product.id ? (
                      <CheckCircle2 size={17} />
                    ) : (
                      <ArrowRight size={17} />
                    )}
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Selected Product */}
          {submitted && selectedProduct && (
            <div className="mt-6 flex flex-col items-start justify-between gap-4 rounded-xl border border-blue-100 bg-blue-50 p-5 sm:flex-row sm:items-center">
              <div>
                <h3 className="font-semibold text-blue-900">
                  Product selected successfully
                </h3>

                <p className="mt-1 text-sm text-blue-700">
                  Next, this product can be sent to the IntentLock
                  security verification engine.
                </p>
              </div>

              <button
                type="button"
                title="Continue to purchase security verification"
                onClick={handleVerifyPurchase}
                className="rounded-lg bg-blue-600 px-5 py-3 text-sm font-medium text-white hover:bg-blue-700"
              >
                Verify Purchase
              </button>
            </div>
          )}
        </div>
      )}

      {/* Demo Notice */}
      <div className="mt-8 rounded-xl border border-amber-100 bg-amber-50 p-4">
        <p className="text-sm font-semibold text-amber-800">
          Demonstration Mode
        </p>

        <p className="mt-1 text-xs text-amber-700">
          The current recommendations and intent summary use static demo
          data. Real AI extraction, product search and matching will be
          connected through your backend APIs.
        </p>
      </div>
    </div>
  );
}

// AI Typewriter Animation
function TypewriterText({ text }) {
  const [displayedText, setDisplayedText] = useState("");

  useEffect(() => {
    let index = 0;

    setDisplayedText("");

    const timer = setInterval(() => {
      index += 1;
      setDisplayedText(text.slice(0, index));

      if (index >= text.length) {
        clearInterval(timer);
      }
    }, 20);

    return () => clearInterval(timer);
  }, [text]);

  return (
    <span>
      {displayedText}
      {displayedText.length < text.length && (
        <span className="typing-cursor">▋</span>
      )}
    </span>
  );
}

// Product Card Skeleton
function ProductCardSkeleton() {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="skeleton-shimmer h-40 w-full rounded-xl" />

      <div className="mt-4 flex justify-between">
        <div className="skeleton-shimmer h-4 w-16 rounded" />
        <div className="skeleton-shimmer h-5 w-24 rounded" />
      </div>

      <div className="skeleton-shimmer mt-4 h-5 w-3/4 rounded" />
      <div className="skeleton-shimmer mt-4 h-7 w-28 rounded" />

      <div className="mt-4 grid grid-cols-2 gap-3">
        <div className="skeleton-shimmer h-14 rounded-lg" />
        <div className="skeleton-shimmer h-14 rounded-lg" />
        <div className="skeleton-shimmer h-14 rounded-lg" />
        <div className="skeleton-shimmer h-14 rounded-lg" />
      </div>

      <div className="skeleton-shimmer mt-5 h-11 rounded-lg" />
    </div>
  );
}

// Product Specification
function Specification({ icon: Icon, label, value }) {
  return (
    <div className="rounded-lg bg-slate-50 p-3">
      <div className="flex items-center gap-1 text-slate-400">
        <Icon size={14} />
        <span className="text-xs">{label}</span>
      </div>

      <p className="mt-2 text-xs font-semibold text-slate-800">
        {value}
      </p>
    </div>
  );
}

export default Shopping;
