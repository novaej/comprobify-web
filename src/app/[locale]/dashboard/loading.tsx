import { Skeleton } from '@/components/ui/skeleton';

export default function DashboardLoading() {
  return (
    <div>
      <div className="mb-6 flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
        <Skeleton className="h-6 w-40" />
        <Skeleton className="h-9 w-36" />
      </div>

      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="rounded-xl border border-border bg-card p-5 shadow-sm">
            <Skeleton className="mb-3 h-4 w-28" />
            <Skeleton className="h-8 w-16" />
          </div>
        ))}
      </div>

      <div className="mb-3 flex items-center justify-between gap-3">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-4 w-16" />
      </div>

      <div className="rounded-xl border border-border bg-card shadow-sm overflow-x-auto">
        <div className="space-y-3 p-4">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="flex items-center gap-4">
              <Skeleton className="h-4 w-16" />
              <Skeleton className="h-4 flex-1" />
              <Skeleton className="h-4 w-20" />
              <Skeleton className="h-4 w-16" />
              <Skeleton className="h-5 w-20 rounded-full" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
