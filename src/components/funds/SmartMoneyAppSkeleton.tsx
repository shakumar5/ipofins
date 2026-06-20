/** Placeholder layout matching SmartMoneyTracker (filters + 12 rows) to prevent CLS on hydrate/load. */
export default function SmartMoneyAppSkeleton({ pulse = true }: { pulse?: boolean }) {
  const rows = Array.from({ length: 12 });

  return (
    <div className={pulse ? 'animate-pulse' : undefined} aria-busy="true" aria-label="Loading Smart Money">
      <div className="p-5 bg-white dark:bg-surface-800 border border-surface-200 dark:border-surface-600 rounded-xl mb-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="smart-money-skeleton-bar h-16" />
          <div className="smart-money-skeleton-bar h-16" />
          <div className="smart-money-skeleton-bar h-16" />
          <div className="smart-money-skeleton-bar h-16" />
        </div>
        <div className="smart-money-skeleton-bar h-3 w-full max-w-2xl mt-3" aria-hidden="true" />
      </div>

      <div className="md:hidden flex flex-wrap gap-2 mb-3" aria-hidden="true">
        <div className="smart-money-skeleton-bar h-7 w-10" />
        <div className="smart-money-skeleton-bar h-7 w-14" />
        <div className="smart-money-skeleton-bar h-7 w-14" />
        <div className="smart-money-skeleton-bar h-7 w-12" />
      </div>

      <div className="md:hidden space-y-2" aria-hidden="true">
        {rows.map((_, i) => (
          <div key={i} className="smart-money-skeleton-card space-y-2">
            <div className="smart-money-skeleton-bar h-3 w-8" />
            <div className="smart-money-skeleton-bar h-4 w-3/4" />
            <div className="smart-money-skeleton-bar h-3 w-1/2" />
            <div className="grid grid-cols-2 gap-2 pt-1">
              <div className="smart-money-skeleton-bar h-8" />
              <div className="smart-money-skeleton-bar h-8" />
            </div>
          </div>
        ))}
      </div>

      <div className="md:hidden mt-3 flex justify-center" aria-hidden="true">
        <div className="smart-money-skeleton-bar h-10 w-44" />
      </div>

      <div className="hidden md:block space-y-2" aria-hidden="true">
        <div className="smart-money-skeleton-bar h-10" />
        {rows.map((_, i) => (
          <div key={i} className="smart-money-skeleton-bar h-10" />
        ))}
      </div>

      <div className="hidden md:flex md:mt-3 md:justify-center" aria-hidden="true">
        <div className="smart-money-skeleton-bar h-10 w-44" />
      </div>

      <div className="smart-money-skeleton-bar h-8 w-full max-w-3xl mt-4" aria-hidden="true" />
      <p className="sr-only">Loading Smart Money…</p>
    </div>
  );
}
