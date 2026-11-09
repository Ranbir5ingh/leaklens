export function Logo({ className = "" }: { className?: string }) {
  return (
    <span className={`inline-flex items-center gap-2 ${className}`}>
      <svg viewBox="0 0 32 32" className="h-7 w-7" aria-hidden>
        <rect width="32" height="32" rx="8" fill="#191a17" />
        <circle cx="14.5" cy="14.5" r="7" fill="none" stroke="#fff" strokeWidth="2.6" />
        <path d="M19.6 19.6 25 25" stroke="#fff" strokeWidth="2.6" strokeLinecap="round" />
        <path d="M14.5 10.8c-1.6 2.2-2.4 3.6-2.4 4.6a2.4 2.4 0 0 0 4.8 0c0-1-.8-2.4-2.4-4.6Z" fill="#e5484d" />
      </svg>
      <span className="text-[15px] font-semibold tracking-tight text-ink">LeakLens</span>
    </span>
  );
}
