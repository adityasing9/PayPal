
import {
  ShieldCheck,
  PackageCheck,
  IndianRupee,
  Store,
  RefreshCw,
  ScanSearch,
  AlertTriangle,
  CheckCircle2,
  LockKeyhole,
  ArrowRight,
  Info,
} from "lucide-react";

const securityChecks = [
  {
    title: "Product Verification",
    description: "Checks whether the product matches your shopping requirements.",
    icon: PackageCheck,
    status: "Awaiting verification",
    color: "blue",
  },
  {
    title: "Price Verification",
    description: "Checks the product price against your approved budget.",
    icon: IndianRupee,
    status: "Awaiting verification",
    color: "green",
  },
  {
    title: "Merchant Verification",
    description: "Reviews seller information and merchant trust signals.",
    icon: Store,
    status: "Awaiting verification",
    color: "purple",
  },
  {
    title: "Subscription Detection",
    description: "Looks for hidden subscriptions and recurring charges.",
    icon: RefreshCw,
    status: "Awaiting verification",
    color: "orange",
  },
  {
    title: "Prompt Injection Detection",
    description: "Checks product content for suspicious instructions targeting the AI agent.",
    icon: ScanSearch,
    status: "Awaiting verification",
    color: "red",
  },
];

const colorStyles = {
  blue: "bg-blue-50 text-blue-600",
  green: "bg-green-50 text-green-600",
  purple: "bg-purple-50 text-purple-600",
  orange: "bg-orange-50 text-orange-600",
  red: "bg-red-50 text-red-600",
};

function Security() {
  return (
    <div className="mx-auto max-w-7xl px-6 py-8">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="mb-2 flex items-center gap-2 text-sm font-medium text-blue-600">
            <ShieldCheck size={17} />
            IntentLock Protection
          </div>

          <h1 className="text-3xl font-bold tracking-tight text-slate-900">
            Security Center
          </h1>

          <p className="mt-2 text-slate-500">
            Review the security checks that protect your purchases.
          </p>
        </div>

        <div className="flex items-center gap-2 rounded-xl border border-blue-100 bg-blue-50 px-4 py-3">
          <LockKeyhole size={19} className="text-blue-600" />
          <span className="text-sm font-semibold text-blue-700">
            Security Firewall
          </span>
        </div>
      </div>

      {/* Demo notice */}
      <div className="mt-7 flex gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4">
        <Info size={20} className="mt-0.5 shrink-0 text-amber-600" />
        <div>
          <h3 className="font-semibold text-amber-900">
            Frontend preview
          </h3>
          <p className="mt-1 text-sm text-amber-800">
            These checks are interface placeholders. Live security results
            will appear after connecting the security engine.
          </p>
        </div>
      </div>

      {/* Security overview */}
      <div className="mt-7 grid gap-5 md:grid-cols-3">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-slate-500">
              Security checks
            </p>
            <ShieldCheck className="text-blue-600" size={21} />
          </div>
          <h2 className="mt-3 text-3xl font-bold text-slate-900">05</h2>
          <p className="mt-1 text-sm text-slate-500">
            Checks configured in the interface
          </p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-slate-500">
              Verified checks
            </p>
            <CheckCircle2 className="text-green-600" size={21} />
          </div>
          <h2 className="mt-3 text-3xl font-bold text-slate-900">--</h2>
          <p className="mt-1 text-sm text-slate-500">
            Waiting for security engine
          </p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-slate-500">
              Threats detected
            </p>
            <AlertTriangle className="text-orange-600" size={21} />
          </div>
          <h2 className="mt-3 text-3xl font-bold text-slate-900">--</h2>
          <p className="mt-1 text-sm text-slate-500">
            No live scan has been performed
          </p>
        </div>
      </div>

      {/* Security checks */}
      <div className="mt-9">
        <div className="mb-5">
          <h2 className="text-xl font-bold text-slate-900">
            Security Verification Layers
          </h2>
          <p className="mt-1 text-sm text-slate-500">
            Five layers designed to protect every purchase.
          </p>
        </div>

        <div className="space-y-4">
          {securityChecks.map((check, index) => {
            const Icon = check.icon;

            return (
              <div
                key={check.title}
                className="flex flex-col gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:border-blue-200 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="flex items-start gap-4">
                  <div
                    className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl ${colorStyles[check.color]}`}
                  >
                    <Icon size={23} />
                  </div>

                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="font-semibold text-slate-900">
                        {index + 1}. {check.title}
                      </h3>
                    </div>

                    <p className="mt-1 max-w-2xl text-sm leading-6 text-slate-500">
                      {check.description}
                    </p>
                  </div>
                </div>

                <div className="flex shrink-0 items-center gap-2 self-start rounded-full bg-slate-100 px-3 py-2 sm:self-center">
                  <span className="h-2 w-2 rounded-full bg-slate-400" />
                  <span className="text-xs font-medium text-slate-600">
                    {check.status}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Protection information */}
      <div className="mt-8 rounded-2xl border border-slate-200 bg-white p-6">
        <div className="flex items-start gap-4">
          <div className="rounded-xl bg-blue-50 p-3">
            <LockKeyhole className="text-blue-600" size={24} />
          </div>

          <div className="flex-1">
            <h2 className="font-bold text-slate-900">
              Your purchase, your permission
            </h2>
            <p className="mt-2 text-sm leading-6 text-slate-500">
              IntentLock is designed to prevent unauthorized purchases.
              The AI agent can help discover products, but payment
              authorization must follow the security and user approval process.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

export default Security;
