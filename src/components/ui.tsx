"use client";

import { useId, useState, type ReactNode } from "react";
import type { Health, SystemStatus } from "@/lib/model";
import { bn, taka } from "@/lib/format";

export type Tone = { fg: string; bg: string; border: string; bar: string; color: string };

export function tone(h: Health | SystemStatus): Tone {
  switch (h) {
    case "ok":
    case "healthy":
      return { fg: "text-ok", bg: "bg-ok-soft", border: "border-ok", bar: "bg-ok", color: "var(--ok)" };
    case "warn":
    case "full":
    case "strained":
      return { fg: "text-warn", bg: "bg-warn-soft", border: "border-warn", bar: "bg-warn", color: "var(--warn)" };
    case "bad":
    case "overloaded":
    case "down":
      return { fg: "text-bad", bg: "bg-bad-soft", border: "border-bad", bar: "bg-bad", color: "var(--bad)" };
    case "booting":
      return { fg: "text-accent", bg: "bg-accent-soft", border: "border-accent", bar: "bg-accent", color: "var(--accent)" };
    default:
      return { fg: "text-muted", bg: "bg-panel", border: "border-line", bar: "bg-off", color: "var(--off)" };
  }
}

export const HEALTH_TEXT: Record<Health, string> = {
  ok: "স্বাভাবিক",
  warn: "চাপে",
  full: "পূর্ণ",
  bad: "ওভারলোড",
  off: "বন্ধ",
  idle: "অলস",
  booting: "চালু হচ্ছে",
};

export const STATUS_TEXT: Record<SystemStatus, string> = {
  healthy: "সুস্থ",
  strained: "চাপে আছে",
  overloaded: "ওভারলোড",
  down: "পুরো সিস্টেম বন্ধ",
};

export function UtilBar({ util, health }: { util: number; health: Health }) {
  const t = tone(health);
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-paper" aria-hidden>
      <div className={`h-full ${t.bar} transition-[width] duration-300`} style={{ width: `${Math.min(100, util * 100)}%` }} />
    </div>
  );
}

/** "এটা কী?": পাশে ছোট বোতাম, চাপলে নিচে ব্যাখ্যা খোলে */
export function Info({ title, children }: { title: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  return (
    <>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen((o) => !o)}
        className="ml-1.5 inline-flex h-5 items-center rounded-full border border-line px-1.5 align-middle text-[11px] font-semibold text-accent hover:border-accent"
      >
        {open ? "বন্ধ করো" : "এটা কী?"}
      </button>
      {open && (
        <span id={id} role="note" aria-label={title} className="mt-2 block rounded-lg bg-accent-soft px-3 py-2 text-sm font-normal text-ink">
          {children}
        </span>
      )}
    </>
  );
}

export function CostTag({ amount }: { amount: number }) {
  return <span className="tnum whitespace-nowrap text-xs font-semibold text-muted">{taka(amount)}/মাস</span>;
}

export function Toggle({
  id,
  label,
  desc,
  checked,
  onChange,
  info,
  cost,
  disabled,
}: {
  id: string;
  label: string;
  desc: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  info?: ReactNode;
  cost?: number;
  disabled?: boolean;
}) {
  return (
    <div>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <label htmlFor={id} className="cursor-pointer font-semibold">
            {label}
          </label>
          {info}
          <p className="text-sm text-muted">
            {desc} {cost !== undefined && <CostTag amount={cost} />}
          </p>
        </div>
        <span className="relative mt-1 inline-flex shrink-0">
          <input
            id={id}
            data-testid={id}
            type="checkbox"
            role="switch"
            className="peer sr-only"
            checked={checked}
            disabled={disabled}
            onChange={(e) => onChange(e.target.checked)}
          />
          <span className="h-6 w-11 rounded-full border border-line bg-paper transition-colors peer-checked:border-accent peer-checked:bg-accent peer-disabled:opacity-50 peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-accent" />
          <span className="pointer-events-none absolute left-1 top-1 h-4 w-4 rounded-full bg-off transition-transform peer-checked:translate-x-5 peer-checked:bg-panel" />
          <label htmlFor={id} className="absolute inset-0 cursor-pointer" aria-hidden />
        </span>
      </div>
    </div>
  );
}

export function Stepper({
  id,
  label,
  value,
  min,
  max,
  onChange,
  desc,
  info,
  minDisabled,
}: {
  id: string;
  label: ReactNode;
  value: number;
  min: number;
  max: number;
  onChange: (v: number) => void;
  desc?: ReactNode;
  info?: ReactNode;
  minDisabled?: boolean;
}) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        <span className="font-semibold" id={`${id}-label`}>
          {label}
        </span>
        {info}
        {desc && <p className="text-sm text-muted">{desc}</p>}
      </div>
      <div className="flex shrink-0 items-center gap-1" role="group" aria-labelledby={`${id}-label`}>
        <button
          type="button"
          id={`${id}-minus`}
          data-testid={`${id}-minus`}
          aria-label="কমাও"
          disabled={value <= min || minDisabled}
          onClick={() => onChange(value - 1)}
          className="h-9 w-9 rounded-lg border border-line text-lg font-bold hover:border-accent disabled:opacity-40"
        >
          −
        </button>
        <span className="tnum w-7 text-center text-lg font-bold" data-testid={`${id}-value`} aria-live="polite">
          {bn(value)}
        </span>
        <button
          type="button"
          id={`${id}-plus`}
          data-testid={`${id}-plus`}
          aria-label="বাড়াও"
          disabled={value >= max}
          onClick={() => onChange(value + 1)}
          className="h-9 w-9 rounded-lg border border-line text-lg font-bold hover:border-accent disabled:opacity-40"
        >
          +
        </button>
      </div>
    </div>
  );
}

export function Chips<T extends string | number>({
  options,
  value,
  onChange,
  label,
  testId,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
  label: string;
  testId?: string;
}) {
  return (
    <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label={label} data-testid={testId}>
      {options.map((o) => (
        <button
          key={String(o.value)}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          data-value={o.value}
          onClick={() => onChange(o.value)}
          className={`rounded-full border px-2.5 py-0.5 text-sm transition-colors ${
            value === o.value ? "border-accent bg-accent-soft font-semibold text-accent" : "border-line text-muted hover:text-ink"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Stars({ count, max = 3, size = "text-base" }: { count: number; max?: number; size?: string }) {
  return (
    <span className={`${size} tracking-tight`} aria-label={`${bn(count)} তারা, ${bn(max)}-এর মধ্যে`}>
      {Array.from({ length: max }, (_, i) => (
        <span key={i} className={i < count ? "text-warn" : "text-line"} aria-hidden>
          ★
        </span>
      ))}
    </span>
  );
}

// ---------- আইকন ----------

export function UsersIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-accent" aria-hidden>
      <circle cx="9" cy="8" r="3.2" fill="none" />
      <path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6" fill="none" />
      <circle cx="17" cy="9" r="2.6" fill="none" />
      <path d="M16 14.2c2.8.3 5 2.6 5 5.8" fill="none" />
    </svg>
  );
}

export function DbIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <ellipse cx="12" cy="5.5" rx="7.5" ry="2.8" fill="none" />
      <path d="M4.5 5.5v13c0 1.5 3.4 2.8 7.5 2.8s7.5-1.3 7.5-2.8v-13" fill="none" />
      <path d="M4.5 12c0 1.5 3.4 2.8 7.5 2.8s7.5-1.3 7.5-2.8" fill="none" />
    </svg>
  );
}

export function PowerIcon({ on }: { on: boolean }) {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className={on ? "text-ok" : "text-off"} aria-hidden>
      <path d="M12 3v8" />
      <path d="M6.3 7.5a8 8 0 1 0 11.4 0" fill="none" />
    </svg>
  );
}
