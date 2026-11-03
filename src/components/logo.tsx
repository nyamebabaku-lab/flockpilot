export function Logo({ light = false }: { light?: boolean }) {
  return (
    <span className={`inline-flex items-center gap-2.5 font-display text-xl font-bold tracking-tight ${light ? "text-white" : "text-ink"}`}>
      <svg viewBox="0 0 32 32" className="h-9 w-9" aria-hidden>
        <rect width="32" height="32" rx="10" fill="#0D5C45" />
        <ellipse cx="16" cy="17" rx="8" ry="10" fill="#F5B301" />
      </svg>
      FlockPilot
    </span>
  );
}
