
import { useEffect, useState } from "react";

import {
  ShoppingBag,
  IndianRupee,
  ShieldCheck,
  ShieldAlert,
  ArrowUpRight,
  ArrowDownRight,
  Clock,
  CheckCircle2,
  Activity,
  Package,
  LockKeyhole,
  TrendingUp,
} from "lucide-react";

import { useNavigate } from "react-router-dom";

function AnimatedCounter({ target, prefix = "", duration = 1400 }) {
  const [count, setCount] = useState(0);

  useEffect(() => {
    let startTime = null;
    let frame;

    const animate = (timestamp) => {
      if (!startTime) startTime = timestamp;

      const progress = Math.min(
        (timestamp - startTime) / duration,
        1
      );

      const easedProgress = 1 - Math.pow(1 - progress, 3);

      setCount(Math.floor(easedProgress * target));

      if (progress < 1) {
        frame = requestAnimationFrame(animate);
      }
    };

    frame = requestAnimationFrame(animate);

    return () => cancelAnimationFrame(frame);
  }, [target, duration]);

  return (
    <>
      {prefix}
      {count.toLocaleString("en-IN")}
    </>
  );
}

function Dashboard() {
  const navigate = useNavigate();

  const stats = [
    {
      title: "Total Purchases",
      value: 12,
      prefix: "",
      icon: ShoppingBag,
      color: "teal",
      change: "Shopping activity",
      trend: "up",
    },
    {
      title: "Money Protected",
      value: 18500,
      prefix: "₹",
      icon: IndianRupee,
      color: "green",
      change: "Protected amount",
      trend: "up",
    },
    {
      title: "Blocked Transactions",
      value: 4,
      prefix: "",
      icon: ShieldAlert,
      color: "red",
      change: "Suspicious attempts",
      trend: "down",
    },
    {
      title: "Successful Purchases",
      value: 8,
      prefix: "",
      icon: CheckCircle2,
      color: "teal",
      change: "Successfully completed",
      trend: "up",
    },
  ];

  const activities = [
    {
      title: "Purchase successfully verified",
      description: "Product security verification completed",
      time: "Today",
      status: "Approved",
      color: "green",
      icon: CheckCircle2,
    },
    {
      title: "Suspicious price detected",
      description: "A purchase was blocked by the security system",
      time: "Yesterday",
      status: "Blocked",
      color: "red",
      icon: ShieldAlert,
    },
    {
      title: "New shopping request",
      description: "AI shopping assistant received a new request",
      time: "Yesterday",
      status: "Pending",
      color: "amber",
      icon: ShoppingBag,
    },
  ];

  const colorStyles = {
    teal: {
      icon: "bg-teal-50 text-teal-700",
      border: "border-teal-100",
    },
    green: {
      icon: "bg-green-50 text-green-600",
      border: "border-green-100",
    },
    red: {
      icon: "bg-red-50 text-red-600",
      border: "border-red-100",
    },
  };

  const activityStyles = {
    green: "bg-green-50 text-green-700",
    red: "bg-red-50 text-red-700",
    amber: "bg-amber-50 text-amber-700",
  };

  return (
    <div className="mx-auto max-w-7xl px-6 py-8">

      {/* Welcome Header */}
      <div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-center">
        <div>
          <p className="text-sm font-semibold text-teal-700">
            Welcome to IntentLock
          </p>

          <h1 className="mt-2 text-3xl font-bold tracking-tight text-stone-900">
            Dashboard
          </h1>

          <p className="mt-2 text-stone-500">
            Monitor your AI shopping activity and payment security.
          </p>
        </div>

        <div className="flex items-center gap-3 rounded-xl border border-green-200 bg-green-50 px-4 py-3">
          <span className="security-pulse h-2.5 w-2.5 rounded-full bg-green-500" />

          <div>
            <p className="text-sm font-semibold text-green-700">
              Security Active
            </p>

            <p className="text-xs text-green-600">
              Protection interface enabled
            </p>
          </div>
        </div>
      </div>

      {/* Statistics */}
      <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((stat) => {
          const Icon = stat.icon;

          return (
            <div
              key={stat.title}
              className={`card rounded-2xl border bg-white p-5 shadow-sm ${colorStyles[stat.color].border}`}
            >
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium text-stone-500">
                  {stat.title}
                </p>

                <div className={`rounded-xl p-3 ${colorStyles[stat.color].icon}`}>
                  <Icon size={21} />
                </div>
              </div>

              <h2 className="mt-5 text-3xl font-bold tracking-tight text-stone-900">
                <AnimatedCounter
                  target={stat.value}
                  prefix={stat.prefix}
                />
              </h2>

              <div className="mt-3 flex items-center gap-2">
                {stat.trend === "up" ? (
                  <ArrowUpRight size={15} className="text-green-600" />
                ) : (
                  <ArrowDownRight size={15} className="text-red-600" />
                )}

                <p className="text-xs text-stone-500">
                  {stat.change}
                </p>
              </div>
            </div>
          );
        })}
      </div>

      {/* Main Content */}
      <div className="mt-9 grid gap-6 lg:grid-cols-3">

        {/* Recent Activity */}
        <section className="card rounded-2xl border border-stone-200 bg-white p-6 shadow-sm lg:col-span-2">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-bold text-stone-900">
                Recent Activity
              </h2>

              <p className="mt-1 text-sm text-stone-500">
                Your latest shopping and security activity.
              </p>
            </div>

            <button
              onClick={() => navigate("/transactions")}
              className="text-sm font-semibold text-teal-700 hover:text-teal-800"
            >
              View All
            </button>
          </div>

          <div className="mt-6 space-y-5">
            {activities.map((activity, index) => {
              const Icon = activity.icon;

              return (
                <div
                  key={activity.title}
                  className="flex items-start gap-4 border-b border-stone-100 pb-5 last:border-0 last:pb-0"
                  style={{
                    animation: "activityEnter 450ms ease both",
                    animationDelay: `${index * 140}ms`,
                  }}
                >
                  <div className={`rounded-xl p-3 ${activityStyles[activity.color]}`}>
                    <Icon size={20} />
                  </div>

                  <div className="min-w-0 flex-1">
                    <h3 className="text-sm font-semibold text-stone-900">
                      {activity.title}
                    </h3>

                    <p className="mt-1 text-sm text-stone-500">
                      {activity.description}
                    </p>

                    <p className="mt-2 flex items-center gap-1 text-xs text-stone-400">
                      <Clock size={13} />
                      {activity.time}
                    </p>
                  </div>

                  <span className={`rounded-full px-3 py-1.5 text-xs font-semibold ${activityStyles[activity.color]}`}>
                    {activity.status}
                  </span>
                </div>
              );
            })}
          </div>
        </section>

        {/* Security Overview */}
        <section className="card rounded-2xl border border-stone-200 bg-white p-6 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="rounded-xl bg-teal-50 p-3">
              <ShieldCheck size={23} className="text-teal-700" />
            </div>

            <div>
              <h2 className="font-bold text-stone-900">
                Security Overview
              </h2>

              <p className="text-xs text-stone-500">
                IntentLock protection layers
              </p>
            </div>
          </div>

          <div className="mt-6 space-y-5">
            {[
              "Product Verification",
              "Price Verification",
              "Merchant Verification",
              "Subscription Detection",
              "Prompt Injection Detection",
            ].map((item) => (
              <div
                key={item}
                className="flex items-center justify-between gap-2"
              >
                <span className="text-sm text-stone-600">
                  {item}
                </span>

                <span className="rounded-full bg-stone-100 px-2.5 py-1 text-xs font-medium text-stone-500">
                  Awaiting API
                </span>
              </div>
            ))}
          </div>

          <button
            onClick={() => navigate("/security")}
            className="mt-7 flex w-full items-center justify-center gap-2 rounded-xl bg-teal-50 px-4 py-3 text-sm font-semibold text-teal-800 transition hover:bg-teal-100"
          >
            <LockKeyhole size={17} />
            Open Security Center
          </button>
        </section>
      </div>

      {/* Quick Actions */}
      <section className="mt-8">
        <div className="mb-5">
          <h2 className="text-xl font-bold text-stone-900">
            Quick Actions
          </h2>

          <p className="mt-1 text-sm text-stone-500">
            Continue your shopping journey.
          </p>
        </div>

        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">

          <button
            onClick={() => navigate("/shopping")}
            className="card flex items-center gap-4 rounded-2xl border border-stone-200 bg-white p-5 text-left shadow-sm"
          >
            <div className="rounded-xl bg-teal-50 p-3 text-teal-700">
              <ShoppingBag size={24} />
            </div>

            <div>
              <h3 className="font-semibold text-stone-900">
                Start AI Shopping
              </h3>

              <p className="mt-1 text-sm text-stone-500">
                Find products using AI.
              </p>
            </div>
          </button>

          <button
            onClick={() => navigate("/compare")}
            className="card flex items-center gap-4 rounded-2xl border border-stone-200 bg-white p-5 text-left shadow-sm"
          >
            <div className="rounded-xl bg-teal-50 p-3 text-teal-700">
              <Package size={24} />
            </div>

            <div>
              <h3 className="font-semibold text-stone-900">
                Compare Products
              </h3>

              <p className="mt-1 text-sm text-stone-500">
                Compare product specifications.
              </p>
            </div>
          </button>

          <button
            onClick={() => navigate("/transactions")}
            className="card flex items-center gap-4 rounded-2xl border border-stone-200 bg-white p-5 text-left shadow-sm"
          >
            <div className="rounded-xl bg-green-50 p-3 text-green-600">
              <Activity size={24} />
            </div>

            <div>
              <h3 className="font-semibold text-stone-900">
                View Transactions
              </h3>

              <p className="mt-1 text-sm text-stone-500">
                Review your purchase history.
              </p>
            </div>
          </button>

        </div>
      </section>

      {/* Demo Notice */}
      <div className="mt-8 flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4">
        <TrendingUp size={20} className="mt-0.5 shrink-0 text-amber-600" />

        <p className="text-sm leading-6 text-amber-800">
          Dashboard statistics and activity are sample demonstration data.
          Live metrics will be connected to the backend.
        </p>
      </div>
    </div>
  );
}

export default Dashboard;
