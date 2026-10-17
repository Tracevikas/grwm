export function PageSkeleton() {
  return (
    <div className="animate-pulse space-y-6 motion-reduce:animate-none" aria-busy="true" aria-label="Loading">
      <div className="h-16 w-48 rounded-2xl bg-surface-2" />
      <div className="h-14 rounded-2xl bg-surface-2" />
      <div className="grid grid-cols-2 gap-x-3 gap-y-6 sm:grid-cols-3">
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className="aspect-[4/5] rounded-[1.4rem] bg-surface-2" />
        ))}
      </div>
    </div>
  );
}
