
import { useMemo, useState } from "react";
import {
  Search,
  ArrowDownLeft,
  ArrowUpRight,
  ShieldCheck,
  ShieldAlert,
  Clock,
  Receipt,
  IndianRupee,
  Filter,
  CalendarDays,
  ExternalLink,
} from "lucide-react";

const initialTransactions = [
  {
    id: "IL-2026-001",
    product: "Wireless Headphones",
    merchant: "Tech Store",
    date: "2026-11-08",
    amount: 2499,
    status: "Completed",
    security: "Verified",
    payment: "Paid",
  },
  {
    id: "IL-2026-002",
    product: "Gaming Keyboard",
    merchant: "Gadget World",
    date: "2026-11-07",
    amount: 1799,
    status: "Blocked",
    security: "Price exceeded budget",
    payment: "Not charged",
  },
  {
    id: "IL-2026-003",
    product: "Bluetooth Speaker",
    merchant: "Audio Hub",
    date: "2026-11-06",
    amount: 1299,
    status: "Pending",
    security: "Awaiting verification",
    payment: "Pending",
  },
  {
    id: "IL-2026-004",
    product: "Laptop Stand",
    merchant: "Office Essentials",
    date: "2026-11-04",
    amount: 899,
    status: "Completed",
    security: "Verified",
    payment: "Paid",
  },
  {
    id: "IL-2026-005",
    product: "Smart Watch",
    merchant: "Unknown Seller",
    date: "2026-11-02",
    amount: 3499,
    status: "Blocked",
    security: "Merchant requires review",
    payment: "Not charged",
  },
];

const statusStyles = {
  Completed: "bg-green-50 text-green-700",
  Blocked: "bg-red-50 text-red-700",
  Pending: "bg-amber-50 text-amber-700",
};

function Transactions() {
  const [transactions] = useState(initialTransactions);
  const [activeFilter, setActiveFilter] = useState("All");
  const [searchTerm, setSearchTerm] = useState("");

  const filteredTransactions = useMemo(() => {
    return transactions.filter((transaction) => {
      const matchesFilter =
        activeFilter === "All" || transaction.status === activeFilter;

      const search = searchTerm.toLowerCase();

      const matchesSearch =
        transaction.product.toLowerCase().includes(search) ||
        transaction.merchant.toLowerCase().includes(search) ||
        transaction.id.toLowerCase().includes(search);

      return matchesFilter && matchesSearch;
    });
  }, [transactions, activeFilter, searchTerm]);

  const completedCount = transactions.filter(
    (item) => item.status === "Completed"
  ).length;

  const blockedCount = transactions.filter(
    (item) => item.status === "Blocked"
  ).length;

  const pendingCount = transactions.filter(
    (item) => item.status === "Pending"
  ).length;

  const totalSpent = transactions
    .filter((item) => item.status === "Completed")
    .reduce((total, item) => total + item.amount, 0);

  return (
    <div className="mx-auto max-w-7xl px-6 py-8">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="mb-2 flex items-center gap-2 text-sm font-medium text-blue-600">
            <Receipt size={17} />
            Purchase Records
          </div>

          <h1 className="text-3xl font-bold text-slate-900">
            Transaction History
          </h1>

          <p className="mt-2 text-slate-500">
            Track your purchases, payments and security decisions.
          </p>
        </div>

        <div className="flex items-center gap-2 self-start rounded-xl border border-blue-100 bg-blue-50 px-4 py-3">
          <ShieldCheck size={19} className="text-blue-600" />
          <span className="text-sm font-semibold text-blue-700">
            Transaction Monitor
          </span>
        </div>
      </div>

      {/* Demo Notice */}
      <div className="mt-7 rounded-xl border border-amber-200 bg-amber-50 p-4">
        <p className="text-sm font-semibold text-amber-900">
          Frontend preview
        </p>
        <p className="mt-1 text-sm text-amber-800">
          The transactions shown below are sample records for demonstration.
          Real transaction history will come from the backend database.
        </p>
      </div>

      {/* Statistics */}
      <div className="mt-7 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <p className="text-sm text-slate-500">Total spent</p>
            <IndianRupee className="text-blue-600" size={21} />
          </div>
          <h2 className="mt-3 text-2xl font-bold text-slate-900">
            ₹{totalSpent.toLocaleString("en-IN")}
          </h2>
          <p className="mt-1 text-xs text-slate-500">
            From completed sample purchases
          </p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <p className="text-sm text-slate-500">Completed</p>
            <ArrowDownLeft className="text-green-600" size={21} />
          </div>
          <h2 className="mt-3 text-2xl font-bold text-slate-900">
            {completedCount}
          </h2>
          <p className="mt-1 text-xs text-slate-500">
            Successful sample purchases
          </p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <p className="text-sm text-slate-500">Blocked</p>
            <ShieldAlert className="text-red-600" size={21} />
          </div>
          <h2 className="mt-3 text-2xl font-bold text-slate-900">
            {blockedCount}
          </h2>
          <p className="mt-1 text-xs text-slate-500">
            Blocked sample transactions
          </p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <p className="text-sm text-slate-500">Pending</p>
            <Clock className="text-amber-600" size={21} />
          </div>
          <h2 className="mt-3 text-2xl font-bold text-slate-900">
            {pendingCount}
          </h2>
          <p className="mt-1 text-xs text-slate-500">
            Awaiting further action
          </p>
        </div>
      </div>

      {/* Transaction List */}
      <section className="mt-9">
        <div className="mb-5 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-xl font-bold text-slate-900">
              Recent Transactions
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              Review your transaction activity.
            </p>
          </div>

          <div className="relative w-full sm:max-w-xs">
            <Search
              size={18}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
            />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search transactions..."
              className="w-full rounded-xl border border-slate-200 bg-white py-3 pl-10 pr-4 text-sm outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
            />
          </div>
        </div>

        {/* Filters */}
        <div className="mb-5 flex flex-wrap items-center gap-2">
          <Filter size={17} className="mr-1 text-slate-400" />

          {["All", "Completed", "Blocked", "Pending"].map((filter) => (
            <button
              key={filter}
              onClick={() => setActiveFilter(filter)}
              className={`rounded-lg px-4 py-2 text-sm font-medium transition ${
                activeFilter === filter
                  ? "bg-blue-600 text-white"
                  : "border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
              }`}
            >
              {filter}
            </button>
          ))}
        </div>

        {/* Table */}
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[850px] text-left">
              <thead className="bg-slate-50">
                <tr className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  <th className="px-5 py-4">Product</th>
                  <th className="px-5 py-4">Date</th>
                  <th className="px-5 py-4">Amount</th>
                  <th className="px-5 py-4">Security</th>
                  <th className="px-5 py-4">Status</th>
                  <th className="px-5 py-4">Payment</th>
                </tr>
              </thead>

              <tbody className="divide-y divide-slate-100">
                {filteredTransactions.map((transaction) => (
                  <tr
                    key={transaction.id}
                    className="transition hover:bg-slate-50"
                  >
                    <td className="px-5 py-4">
                      <p className="font-semibold text-slate-900">
                        {transaction.product}
                      </p>
                      <p className="mt-1 text-xs text-slate-500">
                        {transaction.merchant}
                      </p>
                      <p className="mt-1 text-xs text-slate-400">
                        {transaction.id}
                      </p>
                    </td>

                    <td className="px-5 py-4 text-sm text-slate-600">
                      <div className="flex items-center gap-2">
                        <CalendarDays size={15} />
                        {new Date(
                          transaction.date + "T00:00:00"
                        ).toLocaleDateString("en-IN", {
                          day: "2-digit",
                          month: "short",
                          year: "numeric",
                        })}
                      </div>
                    </td>

                    <td className="px-5 py-4 font-semibold text-slate-900">
                      ₹{transaction.amount.toLocaleString("en-IN")}
                    </td>

                    <td className="px-5 py-4">
                      <span className="text-sm text-slate-600">
                        {transaction.security}
                      </span>
                    </td>

                    <td className="px-5 py-4">
                      <span
                        className={`rounded-full px-3 py-1.5 text-xs font-semibold ${statusStyles[transaction.status]}`}
                      >
                        {transaction.status}
                      </span>
                    </td>

                    <td className="px-5 py-4 text-sm text-slate-600">
                      {transaction.payment}
                    </td>
                  </tr>
                ))}

                {filteredTransactions.length === 0 && (
                  <tr>
                    <td
                      colSpan="6"
                      className="px-5 py-12 text-center text-sm text-slate-500"
                    >
                      No transactions found. Try another search or filter.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* Security Information */}
      <div className="mt-7 flex gap-3 rounded-2xl border border-blue-100 bg-blue-50 p-5">
        <ShieldCheck
          size={22}
          className="mt-0.5 shrink-0 text-blue-600"
        />
        <div>
          <h3 className="font-semibold text-blue-900">
            Every transaction has a security record
          </h3>
          <p className="mt-1 text-sm leading-6 text-blue-800">
            IntentLock is designed to record security decisions alongside
            payment activity, helping users understand why a purchase was
            approved, blocked or left pending.
          </p>
        </div>
      </div>
    </div>
  );
}

export default Transactions;
