export function PageSkeleton() {
  return (
    <div className="space-y-6" aria-busy="true" aria-label="Loading">
      <div className="skeleton h-16 w-48 rounded-2xl" />
      <div className="skeleton h-14 rounded-2xl" />
      <div className="grid grid-cols-2 gap-x-3 gap-y-6 sm:grid-cols-3">
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className="skeleton aspect-[4/5] rounded-[1.4rem]" style={{ animationDelay: `${i * 120}ms` }} />
        ))}
      </div>
    </div>
  );
}
