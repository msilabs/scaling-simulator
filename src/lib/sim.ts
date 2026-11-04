// সিমুলেশনের মডেল: পুরোপুরি pure function, তাই UI আর পরীক্ষা দুই জায়গাতেই একই হিসাব।

export const SERVER_CAPACITY = 200; // প্রতি সার্ভার, রিকোয়েস্ট/সেকেন্ড
export const DB_CAPACITY = 600; // ডাটাবেস, কোয়েরি/সেকেন্ড
export const CACHE_HIT_RATE = 0.8; // Cache চালু থাকলে ৮০% রিকোয়েস্ট ডাটাবেসে যায় না
export const MAX_SERVERS = 8;
export const MAX_TRAFFIC = 3000;

export type ServerState = {
  on: boolean;
  /** চ্যালেঞ্জে নষ্ট সার্ভার: চালু করা যায় না */
  crashed?: boolean;
};

export type Config = {
  traffic: number;
  servers: ServerState[];
  loadBalancer: boolean;
  cache: boolean;
};

export type Health = "ok" | "warn" | "bad" | "off" | "idle";

export type ServerResult = {
  load: number;
  served: number;
  util: number;
  health: Health;
  /** Load Balancer নেই বলে ট্রাফিক পৌঁছায় না */
  unreachable: boolean;
};

export type SystemStatus = "healthy" | "strained" | "overloaded" | "down";

export type SimResult = {
  traffic: number;
  down: boolean;
  status: SystemStatus;
  servers: ServerResult[];
  activeServers: number;
  appServed: number;
  appDropped: number;
  cacheHits: number;
  dbQueries: number;
  dbUtil: number;
  dbHealth: Health;
  dbDropped: number;
  successful: number;
  failed: number;
  successRate: number;
  /** গড় লেটেন্সি, মিলিসেকেন্ড; সিস্টেম বন্ধ হলে null */
  latencyMs: number | null;
  anyServerRed: boolean;
};

export function healthOf(util: number): Health {
  if (util >= 1) return "bad";
  if (util >= 0.7) return "warn";
  return "ok";
}

/** কিউয়িং-এর মোটা দাগের আন্দাজ: লোড যত ক্ষমতার কাছে, অপেক্ষা তত বেশি */
function waitFactor(util: number): number {
  return 1 / (1 - Math.min(util, 0.95));
}

export function simulate(config: Config): SimResult {
  const traffic = Math.max(0, config.traffic);
  const n = config.servers.length;
  const servers: ServerResult[] = config.servers.map(() => ({
    load: 0,
    served: 0,
    util: 0,
    health: "idle" as Health,
    unreachable: false,
  }));

  const activeIdx = config.servers.map((s, i) => (s.on && !s.crashed ? i : -1)).filter((i) => i >= 0);

  let down = false;
  if (config.loadBalancer) {
    if (activeIdx.length === 0) down = true;
    else {
      const share = traffic / activeIdx.length;
      for (const i of activeIdx) servers[i].load = share;
    }
  } else {
    // Load Balancer ছাড়া ব্যবহারকারীরা সরাসরি সার্ভার ১-এর ঠিকানায় যায়
    const entry = config.servers[0];
    if (!entry || !entry.on || entry.crashed) down = true;
    else {
      servers[0].load = traffic;
      for (let i = 1; i < n; i++) servers[i].unreachable = true;
    }
  }

  let appServed = 0;
  let anyServerRed = false;
  config.servers.forEach((s, i) => {
    const r = servers[i];
    if (!s.on || s.crashed) {
      r.health = "off";
      return;
    }
    r.served = Math.min(r.load, SERVER_CAPACITY);
    r.util = r.load / SERVER_CAPACITY;
    r.health = r.unreachable || down ? "idle" : healthOf(r.util);
    if (r.health === "bad") anyServerRed = true;
    appServed += r.served;
  });
  if (down) appServed = 0;

  const appDropped = traffic - appServed;
  const cacheHits = config.cache ? appServed * CACHE_HIT_RATE : 0;
  const dbQueries = appServed - cacheHits;
  const dbUtil = dbQueries / DB_CAPACITY;
  const dbDropped = Math.max(0, dbQueries - DB_CAPACITY);
  const successful = appServed - dbDropped;
  const failed = traffic - successful;
  const successRate = traffic > 0 ? successful / traffic : down ? 0 : 1;

  let latencyMs: number | null = null;
  if (!down && appServed > 0) {
    let weighted = 0;
    for (const r of servers) weighted += r.served * 12 * waitFactor(r.util);
    const appLatency = weighted / appServed;
    const dbLatency = 25 * waitFactor(dbUtil);
    const dataLatency = config.cache ? CACHE_HIT_RATE * 2 + (1 - CACHE_HIT_RATE) * dbLatency : dbLatency;
    latencyMs = Math.round(appLatency + dataLatency);
  } else if (!down) {
    latencyMs = 0;
  }

  let status: SystemStatus;
  const dbHealth: Health = down ? "idle" : healthOf(dbUtil);
  if (down || (traffic > 0 && successful <= 0)) status = "down";
  else if (successRate < 0.99 || anyServerRed || dbHealth === "bad") status = "overloaded";
  else if (servers.some((r) => r.health === "warn") || dbHealth === "warn") status = "strained";
  else status = "healthy";

  return {
    traffic,
    down: status === "down",
    status,
    servers,
    activeServers: activeIdx.length,
    appServed,
    appDropped,
    cacheHits,
    dbQueries,
    dbUtil,
    dbHealth,
    dbDropped,
    successful,
    failed,
    successRate,
    latencyMs,
    anyServerRed,
  };
}

/** N+1 পরীক্ষা: সবচেয়ে ব্যস্ত চালু সার্ভারটা হঠাৎ পড়ে গেলে কী হয় */
export function simulateOneMoreFailure(config: Config): SimResult {
  const base = simulate(config);
  let worst = -1;
  let worstLoad = -1;
  config.servers.forEach((s, i) => {
    if (s.on && !s.crashed && base.servers[i].load > worstLoad) {
      worst = i;
      worstLoad = base.servers[i].load;
    }
  });
  const servers = config.servers.map((s, i) => (i === worst ? { ...s, on: false } : s));
  return simulate({ ...config, servers });
}

// ---------- চ্যালেঞ্জ ----------

export type Goal = {
  id: string;
  label: string;
  check: (r: SimResult, c: Config) => boolean;
};

export type Challenge = {
  id: string;
  title: string;
  story: string;
  hint: string;
  lesson: string;
  start: Config;
  goals: Goal[];
};

const servers = (count: number, crashedFirst = false): ServerState[] =>
  Array.from({ length: count }, (_, i) => ({ on: !(crashedFirst && i === 0), crashed: crashedFirst && i === 0 }));

const goalSuccess: Goal = {
  id: "success",
  label: "৯৯% বা তার বেশি রিকোয়েস্ট সফল",
  check: (r) => r.successRate >= 0.99,
};
const goalNoRed: Goal = {
  id: "no-red",
  label: "কোনো সার্ভার লাল (১০০% লোড) নয়",
  check: (r) => !r.anyServerRed,
};

export const CHALLENGES: Challenge[] = [
  {
    id: "first-rush",
    title: "প্রথম ভিড়",
    story:
      "নতুন রেসিপি অ্যাপটা ফেসবুকে ছড়িয়ে পড়েছে। সেকেন্ডে ৫০০ রিকোয়েস্ট আসছে, অথচ একটা সার্ভার সামলাতে পারে মাত্র ২০০।",
    hint: "শুধু সার্ভার বাড়ালে হবে না। ব্যবহারকারীরা এখনো শুধু সার্ভার ১-এর ঠিকানা জানে। ট্রাফিক ভাগ করে দেবে কে?",
    lesson: "Horizontal scaling কাজ করে তখনই, যখন Load Balancer ট্রাফিক সব সার্ভারে ভাগ করে দেয়।",
    start: { traffic: 500, servers: servers(1), loadBalancer: false, cache: false },
    goals: [goalSuccess, goalNoRed],
  },
  {
    id: "db-gasping",
    title: "ডাটাবেস হাঁপাচ্ছে",
    story:
      "সার্ভার এখন যথেষ্ট, কিন্তু সেকেন্ডে ১০০০ রিকোয়েস্টের প্রতিটাই ডাটাবেসে যাচ্ছে। ডাটাবেস নিতে পারে ৬০০।",
    hint: "বেশিরভাগ ব্যবহারকারী একই জনপ্রিয় রেসিপি দেখছে। একই উত্তর বারবার ডাটাবেস থেকে না এনে কোথায় রাখা যায়?",
    lesson: "বারবার পড়া ডেটা Cache-এ রাখলে ডাটাবেসের লোড অনেক কমে, লেটেন্সিও কমে।",
    start: { traffic: 1000, servers: servers(6), loadBalancer: true, cache: false },
    goals: [
      goalSuccess,
      goalNoRed,
      { id: "db-70", label: "ডাটাবেস লোড ৭০%-এর নিচে", check: (r) => r.dbUtil < 0.7 },
    ],
  },
  {
    id: "crash",
    title: "সার্ভার ক্র্যাশ",
    story:
      "রাত ২টায় সার্ভার ১-এর হার্ডডিস্ক নষ্ট হয়ে গেছে। সেকেন্ডে ৪৫০ রিকোয়েস্ট আসছে, আর সবাই সার্ভার ১-কেই খুঁজছে।",
    hint: "আগে ট্রাফিক বাকি সার্ভারগুলোর দিকে ঘোরাও। তারপর ভাবো, আরেকটা সার্ভার পড়ে গেলেও কি টিকে থাকবে?",
    lesson: "Load Balancer নষ্ট সার্ভার বাদ দিয়ে বাকিগুলোতে ট্রাফিক পাঠায়। একটা বাড়তি সার্ভার (N+1) রাখলে আরেকটা নষ্ট হলেও সেবা চলে।",
    start: { traffic: 450, servers: servers(3, true), loadBalancer: false, cache: false },
    goals: [
      { id: "up", label: "সিস্টেম চালু আছে", check: (r) => !r.down },
      goalSuccess,
      goalNoRed,
      {
        id: "n-plus-1",
        label: "আরেকটা সার্ভার পড়ে গেলেও ৯৯% সফল",
        check: (_r, c) => simulateOneMoreFailure(c).successRate >= 0.99,
      },
    ],
  },
];

export function goalsMet(ch: Challenge, config: Config): boolean[] {
  const r = simulate(config);
  return ch.goals.map((g) => g.check(r, config));
}

export function isSolved(ch: Challenge, config: Config): boolean {
  return goalsMet(ch, config).every(Boolean);
}

export const DEFAULT_FREE_CONFIG: Config = {
  traffic: 150,
  servers: servers(1),
  loadBalancer: false,
  cache: false,
};

export const TRAFFIC_PRESETS: { label: string; value: number }[] = [
  { label: "গভীর রাত", value: 40 },
  { label: "সাধারণ দুপুর", value: 300 },
  { label: "ভাইরাল পোস্ট", value: 1200 },
  { label: "ঈদের সেল", value: 2400 },
];

/** ইংরেজি অঙ্ককে বাংলা অঙ্কে */
export function bn(value: number | string, digits = 0): string {
  const s = typeof value === "number" ? value.toFixed(digits) : value;
  const map = "০১২৩৪৫৬৭৮৯";
  return s.replace(/[0-9]/g, (d) => map[Number(d)]);
}

export function pct(fraction: number): string {
  const p = fraction * 100;
  return bn(p >= 10 || p === 0 ? Math.round(p) : Math.round(p * 10) / 10) + "%";
}

/** সেটিং ঠিকঠাক আছে কি না যাচাই, localStorage থেকে আনা ভাঙা ডেটা ঠেকাতে */
export function sanitizeConfig(raw: unknown, fallback: Config): Config {
  if (!raw || typeof raw !== "object") return fallback;
  const o = raw as Record<string, unknown>;
  const traffic = typeof o.traffic === "number" && isFinite(o.traffic) ? Math.min(MAX_TRAFFIC, Math.max(0, o.traffic)) : fallback.traffic;
  const list = Array.isArray(o.servers) ? o.servers.slice(0, MAX_SERVERS) : null;
  const srv: ServerState[] = list && list.length > 0
    ? list.map((s) => ({ on: !!(s && typeof s === "object" && (s as ServerState).on) }))
    : fallback.servers;
  return {
    traffic,
    servers: srv,
    loadBalancer: typeof o.loadBalancer === "boolean" ? o.loadBalancer : fallback.loadBalancer,
    cache: typeof o.cache === "boolean" ? o.cache : fallback.cache,
  };
}
