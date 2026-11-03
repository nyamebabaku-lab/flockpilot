import { AlertTriangle, CheckCircle2, CircleAlert, type LucideIcon } from "lucide-react";
import Link from "next/link";

export function PageHeader({ title, subtitle, action }: { title: string; subtitle?: string; action?: React.ReactNode }) {
  return (
    <header className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        <h1 className="font-display text-3xl font-bold tracking-tight md:text-4xl">{title}</h1>
        {subtitle && <p className="mt-1 text-ink-soft">{subtitle}</p>}
      </div>
      {action}
    </header>
  );
}

export function Card({ title, action, children, className = "" }: { title?: string; action?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <section className={`card ${className}`}>
      {(title || action) && (
        <div className="mb-4 flex items-center justify-between gap-3">
          {title && <h2 className="font-display text-lg font-semibold">{title}</h2>}
          {action}
        </div>
      )}
      {children}
    </section>
  );
}

export function Stat({ label, value, hint, icon: Icon }: { label: string; value: string; hint?: string; icon?: LucideIcon }) {
  return (
    <div className="card p-4">
      <div className="flex items-center justify-between gap-2 text-sm text-ink-soft">
        <span>{label}</span>
        {Icon && <Icon size={18} className="text-brand" aria-hidden />}
      </div>
      <p className="mt-2 font-display text-2xl font-bold tracking-tight md:text-3xl">{value}</p>
      {hint && <p className="mt-0.5 text-xs text-ink-faint">{hint}</p>}
    </div>
  );
}

const TONES = {
  good: { style: "bg-good-soft text-good", icon: CheckCircle2 },
  warn: { style: "bg-warn-soft text-warn", icon: AlertTriangle },
  bad: { style: "bg-bad-soft text-bad", icon: CircleAlert },
  plain: { style: "bg-raised text-ink-soft", icon: null },
};

/** Status always shows a word beside its colour, so it never relies on colour alone. */
export function Badge({ tone = "plain", children }: { tone?: keyof typeof TONES; children: React.ReactNode }) {
  const { style, icon: Icon } = TONES[tone];
  return (
    <span className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-semibold ${style}`}>
      {Icon && <Icon size={13} aria-hidden />}
      {children}
    </span>
  );
}

export function Empty({ children }: { children: React.ReactNode }) {
  return <p className="rounded-2xl bg-raised px-4 py-6 text-center text-sm text-ink-soft">{children}</p>;
}

export function Field({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return (
    <label className="block">
      <span className="label">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-ink-faint">{hint}</span>}
    </label>
  );
}

export function LinkButton({ href, children, className = "btn-primary" }: { href: string; children: React.ReactNode; className?: string }) {
  return (
    <Link href={href} className={className}>
      {children}
    </Link>
  );
}

export function statusTone(status: string): keyof typeof TONES {
  if (["PAID", "COMPLETED", "ACTIVE", "DONE", "OK", "PRESENT", "SUCCESS"].includes(status)) return "good";
  if (["FAILED", "OUT", "ABSENT", "CANCELLED"].includes(status)) return "bad";
  if (["OPEN", "PART", "LOW", "PROCESSING", "DRAFT", "APPROVED", "PENDING", "LEAVE"].includes(status)) return "warn";
  return "plain";
}

export function StatusBadge({ status }: { status: string }) {
  const text = status.charAt(0) + status.slice(1).toLowerCase();
  return <Badge tone={statusTone(status)}>{text}</Badge>;
}
