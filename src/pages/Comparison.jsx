
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  ArrowRight,
  Check,
  X,
  Star,
  ShieldCheck,
  ShoppingBag,
  DollarSign,
  Trophy,
  Scale,
  Info,
} from "lucide-react";

const products = [
  {
    id: 1,
    name: "SoundCore Life Q20",
    brand: "Soundcore",
    price: 49.99,
    rating: 4.4,
    reviews: "2,450",
    image: "🎧",
    features: {
      "Battery Life": "60 hours",
      "Bluetooth": "5.0",
      "Noise Cancellation": "Hybrid ANC",
      "Microphone": "Built-in",
      "Warranty": "18 months",
    },
  },
  {
    id: 2,
    name: "Sony WH-CH520",
    brand: "Sony",
    price: 59.99,
    rating: 4.5,
    reviews: "3,820",
    image: "🎧",
    features: {
      "Battery Life": "50 hours",
      "Bluetooth": "5.2",
      "Noise Cancellation": "No ANC",
      "Microphone": "Built-in",
      "Warranty": "1 year",
    },
  },
  {
    id: 3,
    name: "JBL Tune 770NC",
    brand: "JBL",
    price: 79.99,
    rating: 4.3,
    reviews: "1,890",
    image: "🎧",
    features: {
      "Battery Life": "70 hours",
      "Bluetooth": "5.3",
      "Noise Cancellation": "Adaptive ANC",
      "Microphone": "Built-in",
      "Warranty": "1 year",
    },
  },
];

const featureNames = [
  "Battery Life",
  "Bluetooth",
  "Noise Cancellation",
  "Microphone",
  "Warranty",
];

function Comparison() {
  const navigate = useNavigate();
  const [selectedProduct, setSelectedProduct] = useState(1);

  const chosenProduct = products.find(
    (product) => product.id === selectedProduct
  );

  const lowestPrice = Math.min(...products.map((p) => p.price));

  return (
    <div className="mx-auto max-w-7xl px-6 py-8">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="mb-2 flex items-center gap-2 text-sm font-medium text-blue-600">
            <Scale size={17} />
            Smart Product Analysis
          </div>

          <h1 className="text-3xl font-bold text-slate-900">
            Product Comparison
          </h1>

          <p className="mt-2 text-slate-500">
            Compare products before making a purchase.
          </p>
        </div>

        <div className="flex items-center gap-2 rounded-xl border border-blue-100 bg-blue-50 px-4 py-3">
          <ShieldCheck size={20} className="text-blue-600" />
          <span className="text-sm font-semibold text-blue-700">
            IntentLock Analysis
          </span>
        </div>
      </div>

      {/* Demo Notice */}
      <div className="mt-7 flex gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4">
        <Info size={20} className="mt-0.5 shrink-0 text-amber-600" />
        <div>
          <h3 className="font-semibold text-amber-900">
            Sample comparison data
          </h3>
          <p className="mt-1 text-sm text-amber-800">
            These products are demonstration examples, not live shopping
            results. Real product comparisons will be connected to the AI
            shopping backend later.
          </p>
        </div>
      </div>

      {/* Summary */}
      <div className="mt-8 grid gap-5 sm:grid-cols-3">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <p className="text-sm text-slate-500">Products compared</p>
            <ShoppingBag size={21} className="text-blue-600" />
          </div>
          <h2 className="mt-3 text-3xl font-bold text-slate-900">
            {products.length}
          </h2>
          <p className="mt-1 text-sm text-slate-500">
            Sample products
          </p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <p className="text-sm text-slate-500">Lowest price</p>
            <DollarSign size={21} className="text-green-600" />
          </div>
          <h2 className="mt-3 text-3xl font-bold text-slate-900">
            ${lowestPrice.toFixed(2)} USD
          </h2>
          <p className="mt-1 text-sm text-slate-500">
            Among compared products
          </p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <p className="text-sm text-slate-500">Features compared</p>
            <Scale size={21} className="text-purple-600" />
          </div>
          <h2 className="mt-3 text-3xl font-bold text-slate-900">
            {featureNames.length}
          </h2>
          <p className="mt-1 text-sm text-slate-500">
            Product specifications
          </p>
        </div>
      </div>

      {/* Product Cards */}
      <div className="mt-9">
        <div className="mb-5">
          <h2 className="text-xl font-bold text-slate-900">
            Compared Products
          </h2>
          <p className="mt-1 text-sm text-slate-500">
            Select a product to mark it as your preferred choice.
          </p>
        </div>

        <div className="grid gap-5 md:grid-cols-3">
          {products.map((product) => {
            const isSelected = selectedProduct === product.id;
            const isLowest = product.price === lowestPrice;

            return (
              <div
                key={product.id}
                className={`relative rounded-2xl border bg-white p-5 shadow-sm transition ${
                  isSelected
                    ? "border-blue-500 ring-2 ring-blue-100"
                    : "border-slate-200 hover:border-blue-200"
                }`}
              >
                {isLowest && (
                  <span className="absolute right-4 top-4 rounded-full bg-green-50 px-3 py-1 text-xs font-semibold text-green-700">
                    Lowest price
                  </span>
                )}

                <div className="flex h-36 items-center justify-center rounded-xl bg-slate-50 text-7xl">
                  {product.image}
                </div>

                <p className="mt-5 text-xs font-medium uppercase tracking-wide text-slate-400">
                  {product.brand}
                </p>

                <h3 className="mt-1 text-lg font-bold text-slate-900">
                  {product.name}
                </h3>

                <div className="mt-3 flex items-center gap-2">
                  <Star
                    size={16}
                    className="fill-amber-400 text-amber-400"
                  />
                  <span className="text-sm font-semibold text-slate-700">
                    {product.rating}
                  </span>
                  <span className="text-xs text-slate-400">
                    ({product.reviews} reviews)
                  </span>
                </div>

                <p className="mt-4 text-2xl font-bold text-slate-900">
                  ${product.price.toFixed(2)} USD
                </p>

                <button
                  onClick={() => setSelectedProduct(product.id)}
                  className={`mt-5 w-full rounded-xl px-4 py-3 text-sm font-semibold transition ${
                    isSelected
                      ? "bg-blue-50 text-blue-700"
                      : "bg-slate-100 text-slate-700 hover:bg-blue-50 hover:text-blue-700"
                  }`}
                >
                  {isSelected ? (
                    <span className="flex items-center justify-center gap-2">
                      <Check size={17} />
                      Selected
                    </span>
                  ) : (
                    "Select Product"
                  )}
                </button>
              </div>
            );
          })}
        </div>
      </div>

      {/* Comparison Table */}
      <div className="mt-10">
        <div className="mb-5">
          <h2 className="text-xl font-bold text-slate-900">
            Detailed Comparison
          </h2>
          <p className="mt-1 text-sm text-slate-500">
            Compare product specifications side by side.
          </p>
        </div>

        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[750px] text-left">
              <thead className="bg-slate-50">
                <tr>
                  <th className="px-5 py-4 text-sm font-semibold text-slate-600">
                    Specifications
                  </th>

                  {products.map((product) => (
                    <th
                      key={product.id}
                      className="px-5 py-4 text-sm font-semibold text-slate-800"
                    >
                      {product.brand}
                    </th>
                  ))}
                </tr>
              </thead>

              <tbody className="divide-y divide-slate-100">
                <tr>
                  <td className="px-5 py-4 text-sm font-medium text-slate-600">
                    Price
                  </td>

                  {products.map((product) => (
                    <td
                      key={product.id}
                      className={`px-5 py-4 text-sm font-bold ${
                        product.price === lowestPrice
                          ? "text-green-600"
                          : "text-slate-900"
                      }`}
                    >
                      ${product.price.toFixed(2)} USD
                    </td>
                  ))}
                </tr>

                {featureNames.map((feature) => (
                  <tr key={feature}>
                    <td className="px-5 py-4 text-sm font-medium text-slate-600">
                      {feature}
                    </td>

                    {products.map((product) => (
                      <td
                        key={product.id}
                        className="px-5 py-4 text-sm text-slate-700"
                      >
                        {product.features[feature]}
                      </td>
                    ))}
                  </tr>
                ))}

                <tr>
                  <td className="px-5 py-4 text-sm font-medium text-slate-600">
                    Customer Rating
                  </td>

                  {products.map((product) => (
                    <td
                      key={product.id}
                      className="px-5 py-4 text-sm font-semibold text-slate-800"
                    >
                      ⭐ {product.rating}/5
                    </td>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Recommendation */}
      <div className="mt-8 rounded-2xl border border-blue-100 bg-blue-50 p-6">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-4">
            <div className="rounded-xl bg-white p-3">
              <Trophy size={25} className="text-blue-600" />
            </div>

            <div>
              <h3 className="font-bold text-slate-900">
                Your selected product
              </h3>

              <p className="mt-1 font-semibold text-blue-700">
                {chosenProduct.name}
              </p>

              <p className="mt-1 text-sm text-slate-600">
                ${chosenProduct.price.toFixed(2)} USD · Rating{" "}
                {chosenProduct.rating}/5
              </p>
            </div>
          </div>

          <button
            onClick={() =>
              navigate("/security", {
                state: {
                  product: chosenProduct,
                  source: "comparison",
                },
              })
            }
            className="flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-6 py-3 font-semibold text-white transition hover:bg-blue-700"
          >
            Continue to Security
            <ArrowRight size={18} />
          </button>
        </div>
      </div>
    </div>
  );
}

export default Comparison;
