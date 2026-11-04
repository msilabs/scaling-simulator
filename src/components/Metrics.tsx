"use client";

import { speedOf, type SimResult } from "@/lib/model";
import { bn, pct, taka } from "@/lib/format";
import { STATUS_TEXT, tone } from "./ui";

export default function Metrics({ r, cost, budget, costNote }: { r: SimResult; cost: number; budget?: number; costNote?: string }) {
  const t = tone(r.status);
  const speed = speedOf(r.latencyMs);
  const overBudget = budget !== undefined && cost > budget;
  return (
    <div className="grid grid-cols-3 gap-2 sm:grid-cols-4" data-testid="metrics">
      <div className={`col-span-3 flex items-center gap-3 rounded-xl border ${t.border} ${t.bg} px-4 py-3 sm:col-span-1`}>
        <span className={`h-3 w-3 shrink-0 rounded-full ${t.bar}`} aria-hidden />
        <div className="min-w-0">
          <p className="label text-muted">অবস্থা</p>
          <p className={`text-lg font-bold leading-tight ${t.fg}`} data-testid="system-status" data-status={r.status}>
            {STATUS_TEXT[r.status]}
          </p>
        </div>
      </div>
      <Card label="সফল রিকোয়েস্ট">
        <p className="tnum text-lg font-bold leading-tight" data-testid="success-rate">
          {pct(r.successRate)}
        </p>
        <p className="tnum text-xs text-muted">{r.failed > 0.5 ? `${bn(Math.round(r.failed))}/সে ফেরত` : "কিছুই ফেরত যায়নি"}</p>
      </Card>
      <Card label="গতি">
        <p className={`text-lg font-bold leading-tight ${tone(speed.health).fg}`}>{speed.label}</p>
        <p className="tnum text-xs text-muted" title="মোটা দাগের আন্দাজ">
          {r.latencyMs === null ? "—" : `আনুমানিক ${bn(Math.min(r.latencyMs, 999))}${r.latencyMs > 999 ? "+" : ""} ms`}
        </p>
      </Card>
      <Card label="মাসিক খরচ">
        <p className={`tnum text-lg font-bold leading-tight ${overBudget ? "text-bad" : ""}`} data-testid="monthly-cost" data-cost={Math.round(cost)}>
          {taka(cost)}
        </p>
        <p className={`tnum text-xs ${overBudget ? "font-semibold text-bad" : "text-muted"}`}>
          {budget !== undefined ? `বাজেট ${taka(budget)}${overBudget ? " ছাড়িয়েছে" : ""}` : costNote ?? "আন্দাজ"}
        </p>
      </Card>
    </div>
  );
}

function Card({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0 rounded-xl border border-line bg-panel px-3 py-3 sm:px-4">
      <p className="label text-muted">{label}</p>
      {children}
    </div>
  );
}
