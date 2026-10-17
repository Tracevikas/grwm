/** "grwm" with the arched-mirror mark. */
export function Wordmark({ className = "" }: { className?: string }) {
  return (
    <span className={`inline-flex items-center gap-1.5 ${className}`}>
      <svg viewBox="0 0 20 24" className="h-[1.1em] w-auto" aria-hidden>
        <path d="M2 23V10a8 8 0 0 1 16 0v13z" fill="var(--accent)" stroke="var(--accent-ink)" strokeOpacity=".15" />
        <path d="M6 10a4 4 0 0 1 4-4" fill="none" stroke="#fff" strokeWidth="1.6" strokeLinecap="round" opacity=".75" />
      </svg>
      <span className="display text-[1.35em] leading-none">grwm</span>
    </span>
  );
}
