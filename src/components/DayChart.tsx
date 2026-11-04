"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { TICK_MINUTES, type DayResult, type Prewarm } from "@/lib/timeline";
import { bn, clock, pct } from "@/lib/format";

type Props = {
  day: DayResult;
  cursor: number;
  onCursor: (i: number) => void;
  prewarm?: Prewarm | null;
};

const M = { top: 10, right: 12, bottom: 24, left: 44 };

/** গোল সংখ্যায় y-অক্ষ: ধাপ ১০০/২০০/২৫০/৫০০/১০০০, সর্বোচ্চ ৫টা দাগ */
function niceScale(v: number): { max: number; step: number } {
  const raw = Math.max(100, v * 1.05);
  const step = [100, 200, 250, 500, 1000].find((st) => raw / st <= 5) ?? 1000;
  return { max: Math.ceil(raw / step) * step, step };
}

const hhmm = (minute: number) => bn(`${String(Math.floor(minute / 60) % 24).padStart(2, "0")}:${String(minute % 60).padStart(2, "0")}`);

export default function DayChart({ day, cursor, onCursor, prewarm }: Props) {
  const wrap = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(640);
  const [hover, setHover] = useState<number | null>(null);
  const dragging = useRef(false);

  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const update = () => setWidth(Math.max(260, Math.round(el.clientWidth)));
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const height = width < 480 ? 190 : 230;
  const w = width - M.left - M.right;
  const h = height - M.top - M.bottom;
  const maxCap = Math.max(...day.ticks.map((t) => t.capacity));
  const { max: yMax, step: yStep } = niceScale(Math.max(day.peakTraffic, maxCap));
  const x = (minute: number) => M.left + (minute / 1440) * w;
  const y = (v: number) => M.top + h - (Math.min(v, yMax) / yMax) * h;

  const paths = useMemo(() => {
    let traffic = "";
    let cap = "";
    day.ticks.forEach((t, i) => {
      const x0 = x(t.minute);
      const x1 = x(t.minute + TICK_MINUTES);
      traffic += `${i === 0 ? "M" : "L"}${x0},${y(t.traffic)}L${x1},${y(t.traffic)}`;
      cap += `${i === 0 ? "M" : "L"}${x0},${y(t.capacity)}L${x1},${y(t.capacity)}`;
    });
    const area = `${traffic}L${x(1440)},${y(0)}L${x(0)},${y(0)}Z`;
    return { traffic, cap, area };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [day, width, yMax]);

  const yTicks = Array.from({ length: Math.round(yMax / yStep) + 1 }, (_, i) => i * yStep);
  const xStep = width < 480 ? 6 : 3;
  const xTicks = Array.from({ length: 24 / xStep + 1 }, (_, i) => i * xStep * 60);

  const indexAt = (clientX: number) => {
    const rect = wrap.current?.getBoundingClientRect();
    if (!rect) return 0;
    const minute = ((clientX - rect.left - M.left) / w) * 1440;
    return Math.max(0, Math.min(day.ticks.length - 1, Math.floor(minute / TICK_MINUTES)));
  };

  const shown = hover ?? cursor;
  const tip = day.ticks[shown];
  const tipLeft = x(tip.minute + TICK_MINUTES / 2);

  return (
    <div className="min-w-0">
      <ul className="mb-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted" aria-label="চার্টের চিহ্ন">
        <li className="flex items-center gap-1.5">
          <span className="inline-block h-0.5 w-4 rounded" style={{ background: "var(--series-1)" }} aria-hidden /> ট্রাফিক
        </li>
        <li className="flex items-center gap-1.5">
          <span className="inline-block h-0.5 w-4 rounded" style={{ background: "var(--series-2)" }} aria-hidden /> সার্ভারের মোট ক্ষমতা
        </li>
        <li className="flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-2.5 rounded-sm bg-bad" aria-hidden /> ফেরত যাওয়া রিকোয়েস্ট
        </li>
        {prewarm && (
          <li className="flex items-center gap-1.5">
            <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: "var(--band)" }} aria-hidden /> আগাম প্রস্তুতির সময়
          </li>
        )}
      </ul>
      <div
        ref={wrap}
        className="relative touch-pan-y select-none"
        data-testid="day-chart"
        onPointerDown={(e) => {
          dragging.current = true;
          onCursor(indexAt(e.clientX));
        }}
        onPointerMove={(e) => {
          const i = indexAt(e.clientX);
          setHover(i);
          if (dragging.current) onCursor(i);
        }}
        onPointerUp={() => (dragging.current = false)}
        onPointerLeave={() => {
          dragging.current = false;
          setHover(null);
        }}
      >
        <svg width={width} height={height} role="img" aria-label={`২৪ ঘণ্টার ট্রাফিক আর ক্ষমতার চার্ট। সর্বোচ্চ ট্রাফিক ${bn(day.peakTraffic)} req/s।`} className="block">
          {prewarm && (
            <rect x={x(prewarm.from * 60)} y={M.top} width={Math.max(0, x(prewarm.to * 60) - x(prewarm.from * 60))} height={h} fill="var(--band)" />
          )}
          {yTicks.map((v) => (
            <g key={v}>
              <line x1={M.left} x2={M.left + w} y1={y(v)} y2={y(v)} stroke="var(--grid-line)" strokeWidth={1} />
              <text x={M.left - 6} y={y(v) + 4} textAnchor="end" fontSize={11} fill="var(--muted)" className="tnum">
                {bn(Math.round(v))}
              </text>
            </g>
          ))}
          {xTicks.map((m) => (
            <text key={m} x={x(m)} y={height - 6} textAnchor={m === 0 ? "start" : m === 1440 ? "end" : "middle"} fontSize={11} fill="var(--muted)">
              {hhmm(m)}
            </text>
          ))}
          <path d={paths.area} fill="var(--series-1)" fillOpacity={0.12} />
          {day.ticks.map((t) => {
            const lost = t.traffic - t.result.successful;
            if (lost <= 0.5) return null;
            return (
              <rect
                key={t.index}
                x={x(t.minute)}
                width={Math.max(1, x(t.minute + TICK_MINUTES) - x(t.minute))}
                y={y(t.traffic)}
                height={Math.max(1, y(t.result.successful) - y(t.traffic))}
                fill="var(--bad)"
                fillOpacity={0.75}
              />
            );
          })}
          <path d={paths.traffic} fill="none" stroke="var(--series-1)" strokeWidth={2} strokeLinejoin="round" />
          <path d={paths.cap} fill="none" stroke="var(--series-2)" strokeWidth={2} strokeLinejoin="round" />
          <line x1={x(day.ticks[cursor].minute + TICK_MINUTES / 2)} x2={x(day.ticks[cursor].minute + TICK_MINUTES / 2)} y1={M.top} y2={M.top + h} stroke="var(--ink)" strokeWidth={1.5} />
          <circle cx={x(day.ticks[cursor].minute + TICK_MINUTES / 2)} cy={y(day.ticks[cursor].traffic)} r={4.5} fill="var(--series-1)" stroke="var(--panel)" strokeWidth={2} />
          {hover !== null && hover !== cursor && (
            <line x1={tipLeft} x2={tipLeft} y1={M.top} y2={M.top + h} stroke="var(--muted)" strokeWidth={1} strokeDasharray="3 3" />
          )}
        </svg>
        {hover !== null && (
          <div
            className="pointer-events-none absolute top-1 z-10 w-44 rounded-lg border border-line bg-panel px-3 py-2 text-xs shadow-lg"
            style={{ left: Math.min(Math.max(0, tipLeft - 88), width - 176) }}
            role="tooltip"
          >
            <p className="mb-1 font-semibold">{clock(tip.minute)}</p>
            <Row color="var(--series-1)" value={`${bn(tip.traffic)} req/s`} label="ট্রাফিক" />
            <Row color="var(--series-2)" value={`${bn(tip.capacity)} req/s`} label="ক্ষমতা" />
            <p className="tnum mt-1 text-muted">
              সার্ভার {bn(tip.serving)}
              {tip.booting > 0 ? ` (+${bn(tip.booting)} চালু হচ্ছে)` : ""} · সফল {pct(tip.result.successRate)}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

function Row({ color, value, label }: { color: string; value: string; label: string }) {
  return (
    <p className="flex items-center gap-1.5">
      <span className="inline-block h-0.5 w-3 rounded" style={{ background: color }} aria-hidden />
      <b className="tnum">{value}</b>
      <span className="text-muted">{label}</span>
    </p>
  );
}

/** একই তথ্য সারণিতে, ঘণ্টা ধরে: চার্ট না দেখেও পড়া যায় */
export function HourlyTable({ day }: { day: DayResult }) {
  const rows = Array.from({ length: 24 }, (_, hIdx) => {
    const ts = day.ticks.filter((t) => Math.floor(t.minute / 60) === hIdx);
    const traffic = ts.reduce((s, t) => s + t.traffic, 0);
    const ok = ts.reduce((s, t) => s + t.result.successful, 0);
    return {
      h: hIdx,
      peak: Math.max(...ts.map((t) => t.traffic)),
      servers: Math.max(...ts.map((t) => t.serving)),
      success: traffic > 0 ? ok / traffic : 1,
    };
  });
  return (
    <details className="mt-3 text-sm">
      <summary className="cursor-pointer font-semibold text-accent">ঘণ্টা ধরে সারণি দেখাও</summary>
      <div className="mt-2 max-h-72 overflow-auto rounded-lg border border-line">
        <table className="tnum w-full text-left text-xs">
          <thead className="sticky top-0 bg-paper">
            <tr>
              <th className="px-2 py-1.5">সময়</th>
              <th className="px-2 py-1.5">সর্বোচ্চ ট্রাফিক</th>
              <th className="px-2 py-1.5">চালু সার্ভার</th>
              <th className="px-2 py-1.5">সফল</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.h} className="border-t border-line">
                <td className="px-2 py-1">{hhmm(r.h * 60)}</td>
                <td className="px-2 py-1">{bn(r.peak)}</td>
                <td className="px-2 py-1">{bn(r.servers)}</td>
                <td className={`px-2 py-1 ${r.success < 0.99 ? "font-semibold text-bad" : ""}`}>{pct(r.success)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}
