
import { ArrowLeft, Construction } from "lucide-react";
import { Link } from "react-router-dom";

function PlaceholderPage({ title, description }) {
  return (
    <div className="min-h-[80vh] flex items-center justify-center p-6">

      <div className="bg-white border border-slate-200 rounded-2xl p-10 max-w-lg w-full text-center shadow-sm">

        <div className="bg-blue-50 text-blue-600 w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-5">
          <Construction size={30} />
        </div>

        <h1 className="text-2xl font-bold text-slate-900">
          {title}
        </h1>

        <p className="text-slate-500 text-sm mt-3 leading-relaxed">
          {description}
        </p>

        <div className="mt-6 inline-flex bg-amber-50 text-amber-700 px-4 py-2 rounded-full text-xs font-medium">
          Under Development
        </div>

        <div className="mt-7">
          <Link
            to="/"
            className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-5 py-3 rounded-lg text-sm font-medium"
          >
            <ArrowLeft size={17} />
            Back to Dashboard
          </Link>
        </div>

      </div>

    </div>
  );
}

export default PlaceholderPage;
