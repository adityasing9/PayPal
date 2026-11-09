
function Skeleton({ className = "" }) {
  return (
    <div
      className={`skeleton-shimmer rounded-lg ${className}`}
      aria-hidden="true"
    />
  );
}

export function ProductCardSkeleton() {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <Skeleton className="h-40 w-full rounded-xl" />

      <div className="mt-4 flex justify-between">
        <Skeleton className="h-4 w-16" />
        <Skeleton className="h-5 w-24" />
      </div>

      <Skeleton className="mt-4 h-5 w-3/4" />
      <Skeleton className="mt-4 h-7 w-28" />

      <div className="mt-4 grid grid-cols-2 gap-3">
        <Skeleton className="h-14 w-full" />
        <Skeleton className="h-14 w-full" />
        <Skeleton className="h-14 w-full" />
        <Skeleton className="h-14 w-full" />
      </div>

      <Skeleton className="mt-5 h-11 w-full rounded-lg" />
    </div>
  );
}

export default Skeleton;
