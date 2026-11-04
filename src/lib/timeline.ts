// ২৪ ঘণ্টার টাইমলাইন: প্রতি ১০ মিনিটে একবার হিসাব (মোট ১৪৪ ধাপ)।
// Autoscaling ট্রাফিক দেখে সার্ভার বাড়ায়-কমায়, কিন্তু নতুন সার্ভার চালু হতে সময় লাগে।

import { COST, SERVER_CAPACITY, simulate, type Config, type ServerState, type SimResult } from "./model";

export const TICK_MINUTES = 10;
export const TICKS = (24 * 60) / TICK_MINUTES; // ১৪৪
/** নতুন সার্ভার চাওয়ার পর এক ধাপ (১০ মিনিট) চালু হতে থাকে, তার পরের ধাপ থেকে ট্রাফিক নেয় */
export const BOOT_TICKS = 1;

export type PatternId = "normal" | "flash" | "viral";

export type Autoscale = {
  enabled: boolean;
  min: number;
  max: number;
  /** এই লোডে পৌঁছালে নতুন সার্ভার চায় (০.৫ = ৫০%) */
  target: number;
};

/** জানা ভিড়ের আগে নির্দিষ্ট সময়ে ন্যূনতম সার্ভার বাড়িয়ে রাখা (scheduled scaling) */
export type Prewarm = {
  enabled: boolean;
  from: number; // ঘণ্টা ০–২৩
  to: number; // ঘণ্টা ১–২৪
  min: number;
};

export type DayConfig = Omit<Config, "traffic"> & {
  pattern: PatternId;
  autoscale: Autoscale;
  prewarm: Prewarm;
};

type Point = [minute: number, value: number];

const NORMAL_HOURLY = [90, 70, 55, 45, 40, 55, 110, 220, 360, 430, 470, 500, 540, 520, 480, 460, 490, 580, 700, 800, 850, 760, 520, 260, 90];
const normalPoints: Point[] = NORMAL_HOURLY.map((v, h) => [h * 60, v]);

const between = (pts: Point[], from: number, to: number) => pts.filter(([m]) => m >= from && m <= to);

export const PATTERNS: Record<PatternId, { label: string; desc: string; points: Point[] }> = {
  normal: {
    label: "সাধারণ দিন",
    desc: "রাতে কম, দুপুরে মাঝারি, রাত ৯টার দিকে সবচেয়ে বেশি। ট্রাফিক ধীরে ধীরে ওঠানামা করে।",
    points: normalPoints,
  },
  flash: {
    label: "ফ্ল্যাশ সেল",
    desc: "রাত ঠিক ৮টায় সেল শুরু। এক মিনিটের মধ্যে ট্রাফিক প্রায় তিনগুণ হয়ে যায়, চলে রাত ১০টা পর্যন্ত।",
    points: [
      ...between(normalPoints, 0, 19 * 60),
      [1199, 790],
      [1200, 2200],
      [1260, 2000],
      [1290, 1500],
      [1319, 1000],
      [1320, 600],
      [1380, 260],
      [1440, 90],
    ],
  },
  viral: {
    label: "হঠাৎ ভাইরাল",
    desc: "দুপুর ২টায় একটা পোস্ট ভাইরাল হয়। আগে থেকে জানা ছিল না, আধা ঘণ্টায় ট্রাফিক তিনগুণ।",
    points: [
      ...between(normalPoints, 0, 13 * 60),
      [840, 480],
      [870, 1100],
      [900, 1600],
      [960, 1500],
      [1080, 700],
      ...between(normalPoints, 19 * 60, 1440),
    ],
  },
};

export function trafficAt(pattern: PatternId, minute: number): number {
  const pts = PATTERNS[pattern].points;
  if (minute <= pts[0][0]) return pts[0][1];
  for (let i = 1; i < pts.length; i++) {
    const [m1, v1] = pts[i];
    if (minute <= m1) {
      const [m0, v0] = pts[i - 1];
      return Math.round(v0 + ((v1 - v0) * (minute - m0)) / (m1 - m0));
    }
  }
  return pts[pts.length - 1][1];
}

export type Tick = {
  index: number;
  minute: number;
  traffic: number;
  serving: number;
  booting: number;
  capacity: number;
  result: SimResult;
  servers: ServerState[];
};

export type DayResult = {
  ticks: Tick[];
  totalRequests: number;
  successful: number;
  dropped: number;
  successRate: number;
  peakTraffic: number;
  peakServers: number;
  avgPaidServers: number;
  monthlyCost: number;
};

function minAt(day: DayConfig, tick: number): number {
  const minute = (tick % TICKS) * TICK_MINUTES;
  let min = day.autoscale.min;
  const p = day.prewarm;
  if (p.enabled && minute >= p.from * 60 && minute < p.to * 60) min = Math.max(min, p.min);
  return min;
}

export function runDay(day: DayConfig): DayResult {
  const ticks: Tick[] = [];
  const auto = day.autoscale.enabled;
  const max = Math.max(1, day.autoscale.max);
  const target = Math.min(0.95, Math.max(0.3, day.autoscale.target));
  const wanted = (traffic: number) => Math.ceil(traffic / (SERVER_CAPACITY * target));

  // চালু সার্ভার আর চালু হতে থাকা সার্ভার (কোন ধাপে তৈরি হবে)
  let serving = auto
    ? Math.min(max, Math.max(minAt(day, 0), wanted(trafficAt(day.pattern, 0))))
    : day.servers.filter((s) => s.on && !s.crashed).length;
  let bootingReady: number[] = [];

  let totalRequests = 0;
  let successful = 0;
  let paidServerTicks = 0;
  let peakTraffic = 0;
  let peakServers = 0;

  for (let t = 0; t < TICKS; t++) {
    // এই ধাপের শুরুতে যেগুলো তৈরি, সেগুলো ট্রাফিক নিতে শুরু করে
    const ready = bootingReady.filter((r) => r <= t).length;
    serving += ready;
    bootingReady = bootingReady.filter((r) => r > t);

    const minute = t * TICK_MINUTES;
    const traffic = trafficAt(day.pattern, minute);
    const servers: ServerState[] = [
      ...Array.from({ length: serving }, () => ({ on: true })),
      ...bootingReady.map(() => ({ on: false, booting: true })),
    ];
    const result = simulate({ ...day, traffic, servers });

    ticks.push({ index: t, minute, traffic, serving, booting: bootingReady.length, capacity: serving * SERVER_CAPACITY, result, servers });
    totalRequests += traffic;
    successful += result.successful;
    paidServerTicks += serving + bootingReady.length;
    peakTraffic = Math.max(peakTraffic, traffic);
    peakServers = Math.max(peakServers, serving + bootingReady.length);

    // ধাপের শেষে autoscaler সিদ্ধান্ত নেয়, যা দেখেছে তার ভিত্তিতে
    if (auto) {
      const desired = Math.min(max, Math.max(minAt(day, t + 1), wanted(traffic)));
      const total = serving + bootingReady.length;
      if (desired > total) {
        for (let k = 0; k < desired - total; k++) bootingReady.push(t + 1 + BOOT_TICKS);
      } else if (desired < serving && bootingReady.length === 0) {
        serving -= 1; // কমানোর সময় ধীরে, প্রতি ধাপে একটা করে (cooldown)
      }
    }
  }

  const avgPaidServers = paidServerTicks / TICKS;
  const fixed =
    (day.loadBalancer ? COST.loadBalancer : 0) + (day.cache ? COST.cache : 0) + COST.database + day.replicas * COST.replica;

  // প্রতি ধাপ ১০ মিনিট = ৬০০ সেকেন্ড; হার তাই অনুপাতে একই থাকে
  const sec = TICK_MINUTES * 60;
  return {
    ticks,
    totalRequests: totalRequests * sec,
    successful: successful * sec,
    dropped: (totalRequests - successful) * sec,
    successRate: totalRequests > 0 ? successful / totalRequests : 1,
    peakTraffic,
    peakServers,
    avgPaidServers,
    monthlyCost: fixed + avgPaidServers * COST.server,
  };
}

/** নির্দিষ্ট সময়ের (মিনিট) মধ্যে সফলের হার */
export function windowSuccess(day: DayResult, fromMinute: number, toMinute: number): number {
  let total = 0;
  let ok = 0;
  for (const t of day.ticks) {
    if (t.minute >= fromMinute && t.minute < toMinute) {
      total += t.traffic;
      ok += t.result.successful;
    }
  }
  return total > 0 ? ok / total : 1;
}

export const DEFAULT_DAY: DayConfig = {
  writeShare: 0.05,
  servers: Array.from({ length: 6 }, () => ({ on: true })),
  loadBalancer: true,
  cache: true,
  replicas: 0,
  pattern: "flash",
  autoscale: { enabled: false, min: 2, max: 12, target: 0.7 },
  prewarm: { enabled: false, from: 19, to: 22, min: 10 },
};

/** localStorage থেকে আনা ডেটা যাচাই */
export function sanitizeDay(raw: unknown, fallback: DayConfig = DEFAULT_DAY): DayConfig {
  if (!raw || typeof raw !== "object") return fallback;
  const o = raw as Record<string, unknown>;
  const int = (v: unknown, lo: number, hi: number, d: number) =>
    typeof v === "number" && isFinite(v) ? Math.round(Math.min(hi, Math.max(lo, v))) : d;
  const bool = (v: unknown, d: boolean) => (typeof v === "boolean" ? v : d);
  const a = (o.autoscale && typeof o.autoscale === "object" ? o.autoscale : {}) as Record<string, unknown>;
  const p = (o.prewarm && typeof o.prewarm === "object" ? o.prewarm : {}) as Record<string, unknown>;
  const count = Array.isArray(o.servers) ? Math.min(12, Math.max(1, o.servers.length)) : fallback.servers.length;
  const pattern = o.pattern === "normal" || o.pattern === "flash" || o.pattern === "viral" ? o.pattern : fallback.pattern;
  const target = typeof a.target === "number" && [0.5, 0.6, 0.7, 0.8].includes(a.target) ? a.target : fallback.autoscale.target;
  const min = int(a.min, 1, 12, fallback.autoscale.min);
  const from = int(p.from, 0, 23, fallback.prewarm.from);
  return {
    writeShare: typeof o.writeShare === "number" && isFinite(o.writeShare) ? Math.min(0.5, Math.max(0, o.writeShare)) : fallback.writeShare,
    servers: Array.from({ length: count }, () => ({ on: true })),
    loadBalancer: bool(o.loadBalancer, fallback.loadBalancer),
    cache: bool(o.cache, fallback.cache),
    replicas: int(o.replicas, 0, 3, fallback.replicas),
    pattern,
    autoscale: { enabled: bool(a.enabled, false), min, max: Math.max(min, int(a.max, 1, 12, fallback.autoscale.max)), target },
    prewarm: { enabled: bool(p.enabled, false), from, to: Math.max(from + 1, int(p.to, 1, 24, fallback.prewarm.to)), min: int(p.min, 1, 12, fallback.prewarm.min) },
  };
}
