"use client";

// Reusable design-system components. Spacing scale: 4/8/12/16/24.
// Touch targets are at least 44px tall (Apple HIG).

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight, Loader2, X } from "lucide-react";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { useI18n } from "@/lib/i18n";
import { SectionTabs } from "./SectionTabs";

export function cn(...c: (string | false | null | undefined)[]) {
  return c.filter(Boolean).join(" ");
}

// ---------------------------------------------------------------------------
type Variant = "primary" | "secondary" | "ghost" | "danger" | "teal";
const VARIANTS: Record<Variant, string> = {
  primary: "bg-ocean text-black hover:bg-ocean-deep active:bg-ocean-deep",
  teal: "bg-teal text-abyss hover:bg-teal-dim font-semibold",
  secondary: "bg-surface-2 text-ink border border-line hover:bg-surface-3",
  ghost: "text-ink-2 hover:bg-surface-2",
  danger: "bg-bad/15 text-bad border border-bad/30 hover:bg-bad/25",
};

export function Button({
  variant = "primary",
  size = "md",
  loading,
  className,
  children,
  ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: "sm" | "md" | "lg"; loading?: boolean }) {
  return (
    <button
      {...rest}
      disabled={rest.disabled || loading}
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-xl font-medium transition-colors disabled:opacity-50 disabled:pointer-events-none select-none",
        size === "sm" && "min-h-9 px-3 text-sm",
        size === "md" && "min-h-11 px-4 text-[15px]",
        size === "lg" && "min-h-14 px-5 text-base",
        VARIANTS[variant],
        className,
      )}
    >
      {loading && <Loader2 className="size-4 animate-spin" />}
      {children}
    </button>
  );
}

export function LinkButton({
  href,
  variant = "primary",
  size = "md",
  className,
  children,
}: {
  href: string;
  variant?: Variant;
  size?: "sm" | "md" | "lg";
  className?: string;
  children: ReactNode;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-xl font-medium transition-colors select-none",
        size === "sm" && "min-h-9 px-3 text-sm",
        size === "md" && "min-h-11 px-4 text-[15px]",
        size === "lg" && "min-h-14 px-5 text-base",
        VARIANTS[variant],
        className,
      )}
    >
      {children}
    </Link>
  );
}

// ---------------------------------------------------------------------------
export function Card({ className, children, ...rest }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div {...rest} className={cn("print-card rounded-[var(--radius-card)] border border-line/70 bg-surface/80 p-4 backdrop-blur-md", className)}>
      {children}
    </div>
  );
}

export function SectionTitle({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-2 mt-6 flex items-center justify-between gap-2 px-1">
      <h2 className="text-[15px] font-semibold text-ink-2">{children}</h2>
      {action}
    </div>
  );
}

// ---------------------------------------------------------------------------
/** The three main tabs have no back button; every other page does. */
const ROOT_PATHS = ["/", "/trips", "/account"];

/** Back = the previous page; with no history (opened from a link) go home. */
export function useSmartBack() {
  const router = useRouter();
  return () => {
    if (typeof window !== "undefined" && window.history.length > 1) router.back();
    else router.push("/");
  };
}

/** Round back button. Mirrors the arrow in RTL. */
export function BackButton({ className }: { className?: string }) {
  const { dir, t } = useI18n();
  const goBack = useSmartBack();
  const BackIcon = dir === "rtl" ? ChevronRight : ChevronLeft;
  return (
    <button type="button" aria-label={t("رجوع", "Back")} onClick={goBack} className={cn("grid size-11 shrink-0 place-items-center rounded-full text-ink-2 hover:bg-surface-2", className)}>
      <BackIcon className="size-6" />
    </button>
  );
}

export function PageHeader({
  title,
  subtitle,
  back,
  actions,
  section,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  /** a path = go there; true/undefined = previous page (automatic except on the main tabs); false = none */
  back?: string | boolean;
  actions?: ReactNode;
  /** show the secondary tabs of a primary section under the title */
  section?: "trips" | "stats";
}) {
  const path = usePathname();
  const router = useRouter();
  const goBack = useSmartBack();
  const { dir, t } = useI18n();
  const BackIcon = dir === "rtl" ? ChevronRight : ChevronLeft;
  const showBack = back === undefined ? !ROOT_PATHS.includes(path) : back !== false;
  return (
    <header className="no-print sticky top-0 z-30 -mx-4 mb-3 border-b border-line/40 bg-navy/85 px-4 pb-3 pt-[calc(var(--safe-top)+0.75rem)] backdrop-blur-xl">
      <div className="flex min-h-11 items-center gap-2">
        {showBack && (
          <button
            aria-label={t("رجوع", "Back")}
            onClick={() => (typeof back === "string" ? router.push(back) : goBack())}
            className="-ms-2 grid size-11 place-items-center rounded-full text-ink-2 hover:bg-surface-2"
          >
            <BackIcon className="size-6" />
          </button>
        )}
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-xl font-bold">{title}</h1>
          {subtitle && <p className="truncate text-sm text-muted">{subtitle}</p>}
        </div>
        {actions}
      </div>
      {section && <SectionTabs section={section} />}
    </header>
  );
}

// ---------------------------------------------------------------------------
export function Field({
  label,
  hint,
  error,
  children,
  className,
}: {
  label: ReactNode;
  hint?: ReactNode;
  error?: string | null;
  children: ReactNode;
  className?: string;
}) {
  return (
    <label className={cn("block", className)}>
      <span className="mb-1.5 block text-sm font-medium text-ink-2">{label}</span>
      {children}
      {error ? <span className="mt-1 block text-xs text-bad">{error}</span> : hint ? <span className="mt-1 block text-xs text-muted">{hint}</span> : null}
    </label>
  );
}

const inputCls =
  "w-full min-h-12 rounded-xl border border-line bg-surface-2 px-3.5 text-ink placeholder:text-muted/70 focus:border-teal focus:outline-none";

export function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={cn(inputCls, props.className)} />;
}

/** Decimal input that accepts Arabic-Indic digits and "," / "٫" as decimal separator. */
export function NumberInput({
  value,
  onChange,
  ...rest
}: Omit<React.InputHTMLAttributes<HTMLInputElement>, "value" | "onChange"> & {
  value: number | null;
  onChange: (v: number | null) => void;
}) {
  const [text, setText] = useState(value == null ? "" : String(value));
  useEffect(() => {
    const cur = text === "" ? null : Number(text);
    if (cur !== value) setText(value == null ? "" : String(value));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);
  return (
    <input
      {...rest}
      type="text"
      inputMode="decimal"
      autoComplete="off"
      value={text}
      onChange={(e) => {
        const raw = e.target.value.replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d))).replace(/[,٫]/g, ".");
        if (!/^\d*\.?\d*$/.test(raw)) return;
        setText(raw);
        if (raw === "" || raw === ".") onChange(null);
        else onChange(Number(raw));
      }}
      className={cn(inputCls, "ltr text-start", rest.className)}
    />
  );
}

export function Textarea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea rows={3} {...props} className={cn(inputCls, "py-3 leading-relaxed", props.className)} />;
}

export function Select({
  value,
  onChange,
  options,
  placeholder,
  className,
}: {
  value: string | null | undefined;
  onChange: (v: string | null) => void;
  options: { value: string; label: string }[];
  placeholder?: string;
  className?: string;
}) {
  return (
    <select
      value={value ?? ""}
      onChange={(e) => onChange(e.target.value || null)}
      className={cn(inputCls, "appearance-none bg-[length:12px] pe-8", className)}
    >
      <option value="">{placeholder ?? "—"}</option>
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

/** Large tap-friendly choice chips (single select, tap again to clear). */
export function Choice<T extends string>({
  value,
  onChange,
  options,
  allowClear = true,
  className,
}: {
  value: T | null | undefined;
  onChange: (v: T | null) => void;
  options: { value: T; label: ReactNode }[];
  allowClear?: boolean;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-wrap gap-2", className)}>
      {options.map((o) => {
        const on = value === o.value;
        return (
          <button
            type="button"
            key={o.value}
            onClick={() => onChange(on && allowClear ? null : o.value)}
            className={cn(
              "min-h-11 rounded-xl border px-3.5 text-sm transition-colors",
              on ? "border-teal bg-teal/15 text-teal" : "border-line bg-surface-2 text-ink-2 hover:bg-surface-3",
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

export function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: ReactNode }) {
  const id = useId();
  return (
    <label htmlFor={id} className="flex min-h-11 cursor-pointer items-center justify-between gap-3">
      <span className="text-sm text-ink-2">{label}</span>
      <span className="relative">
        <input id={id} type="checkbox" className="peer sr-only" checked={checked} onChange={(e) => onChange(e.target.checked)} />
        <span className="block h-7 w-12 rounded-full bg-surface-3 transition-colors peer-checked:bg-teal" />
        <span className="absolute top-1 start-1 size-5 rounded-full bg-white transition-transform peer-checked:translate-x-5 rtl:peer-checked:-translate-x-5" />
      </span>
    </label>
  );
}

// ---------------------------------------------------------------------------
export function Badge({ tone = "default", children, className }: { tone?: "default" | "good" | "warn" | "bad" | "teal" | "ocean"; children: ReactNode; className?: string }) {
  const t = {
    default: "bg-surface-3 text-ink-2",
    good: "bg-good/15 text-good",
    warn: "bg-warn/15 text-warn",
    bad: "bg-bad/15 text-bad",
    teal: "bg-teal/15 text-teal",
    ocean: "bg-ocean/20 text-[#8cc0ff]",
  }[tone];
  return <span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium", t, className)}>{children}</span>;
}

export function Stat({ label, value, sub, icon }: { label: ReactNode; value: ReactNode; sub?: ReactNode; icon?: ReactNode }) {
  return (
    <Card className="p-3.5">
      <div className="flex items-center gap-1.5 text-xs text-muted">
        {icon}
        <span className="truncate">{label}</span>
      </div>
      <div className="mt-1 text-2xl font-bold leading-tight">{value}</div>
      {sub && <div className="mt-0.5 truncate text-xs text-muted">{sub}</div>}
    </Card>
  );
}

export function Progress({ value, tone = "teal" }: { value: number; tone?: "teal" | "ocean" | "good" }) {
  const c = { teal: "bg-teal", ocean: "bg-ocean", good: "bg-good" }[tone];
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-surface-3">
      <div className={cn("h-full rounded-full", c)} style={{ width: `${Math.round(Math.max(0, Math.min(1, value)) * 100)}%` }} />
    </div>
  );
}

export function Empty({ icon, title, children, action }: { icon?: ReactNode; title: ReactNode; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-[var(--radius-card)] border border-dashed border-line px-6 py-10 text-center">
      {icon && <div className="text-4xl">{icon}</div>}
      <div className="font-semibold">{title}</div>
      {children && <div className="max-w-sm text-sm text-muted">{children}</div>}
      {action}
    </div>
  );
}

export function Notice({ tone = "info", children, className }: { tone?: "info" | "warn" | "bad"; children: ReactNode; className?: string }) {
  const t = {
    info: "border-ocean/30 bg-ocean/10 text-[#b7d6ff]",
    warn: "border-warn/30 bg-warn/10 text-warn",
    bad: "border-bad/30 bg-bad/10 text-bad",
  }[tone];
  return <div className={cn("rounded-xl border px-3.5 py-3 text-sm leading-relaxed", t, className)}>{children}</div>;
}

// ---------------------------------------------------------------------------
export function Sheet({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: ReactNode; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const k = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", k);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", k);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div
        ref={ref}
        className="relative max-h-[92dvh] w-full max-w-lg overflow-y-auto rounded-t-3xl border border-line bg-[#0a1220] p-4 pb-[calc(var(--safe-bottom)+1rem)] sm:rounded-3xl"
      >
        <div className="mb-3 flex items-center justify-between gap-2">
          <h3 className="text-lg font-bold">{title}</h3>
          <button onClick={onClose} aria-label="close" className="grid size-10 place-items-center rounded-full hover:bg-surface-2">
            <X className="size-5" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

/** Sample-size label shown next to any percentage. */
export function N({ n }: { n: number }) {
  const { t } = useI18n();
  return <span className="text-xs text-muted">{t(`(ع=${n})`, `(n=${n})`)}</span>;
}

export function Spinner() {
  return <Loader2 className="size-5 animate-spin text-muted" />;
}

/** Horizontal scroll row for chips/filters. */
export function ScrollRow({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 pb-1", className)}>{children}</div>;
}
