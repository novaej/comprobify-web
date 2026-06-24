import { Skeleton } from '@/components/ui/skeleton';

export default function InvoiceDetailLoading() {
  return (
    <div className="space-y-5">
      <Skeleton className="h-4 w-24" />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 space-y-2">
          <Skeleton className="h-5 w-40" />
          <Skeleton className="h-4 w-56" />
        </div>
        <Skeleton className="h-5 w-20 rounded-full" />
      </div>

      <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
        <div className="grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="space-y-2">
              <Skeleton className="h-3 w-16" />
              <Skeleton className="h-4 w-24" />
            </div>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <Skeleton className="h-9 w-28" />
        <Skeleton className="h-9 w-28" />
      </div>

      <div>
        <Skeleton className="mb-3 h-4 w-32" />
        <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
          <div className="space-y-3 p-4">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="flex items-center gap-4">
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-4 w-28" />
                <Skeleton className="h-4 flex-1" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
