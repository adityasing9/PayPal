import {
  createContext,
  useCallback,
  useContext,
  useState,
} from "react";
import {
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Info,
  X,
} from "lucide-react";

const ToastContext = createContext(null);

const toastStyles = {
  success: {
    icon: CheckCircle2,
    color: "text-green-600",
    background: "bg-green-50",
    title: "Success",
  },
  error: {
    icon: XCircle,
    color: "text-red-600",
    background: "bg-red-50",
    title: "Error",
  },
  warning: {
    icon: AlertTriangle,
    color: "text-amber-600",
    background: "bg-amber-50",
    title: "Warning",
  },
  info: {
    icon: Info,
    color: "text-blue-600",
    background: "bg-blue-50",
    title: "Information",
  },
};

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  const showToast = useCallback((message, type = "success") => {
    const id = Date.now() + Math.random();

    setToasts((current) => [
      ...current,
      { id, message, type },
    ]);

    setTimeout(() => {
      setToasts((current) =>
        current.filter((toast) => toast.id !== id)
      );
    }, 3500);
  }, []);

  const removeToast = (id) => {
    setToasts((current) =>
      current.filter((toast) => toast.id !== id)
    );
  };

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}

      <div className="fixed right-4 top-20 z-[100] flex w-[calc(100%-2rem)] max-w-sm flex-col gap-3">
        {toasts.map((toast) => {
          const style = toastStyles[toast.type] || toastStyles.info;
          const Icon = style.icon;

          return (
            <div
              key={toast.id}
              className="toast-enter flex items-start gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-xl"
              role="status"
            >
              <div className={`rounded-lg p-2 ${style.background}`}>
                <Icon size={20} className={style.color} />
              </div>

              <div className="min-w-0 flex-1">
                <p className="text-sm font-bold text-slate-900">
                  {style.title}
                </p>
                <p className="mt-1 break-words text-sm text-slate-600">
                  {toast.message}
                </p>
              </div>

              <button
                type="button"
                onClick={() => removeToast(toast.id)}
                aria-label="Dismiss notification"
                className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
              >
                <X size={17} />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);

  if (!context) {
    throw new Error("useToast must be used inside ToastProvider");
  }

  return context;
}