// সিমুলেশনের মূল মডেল: এক মুহূর্তের স্থির অবস্থা (steady state)।
// পুরোপুরি pure function, তাই UI, ২৪ ঘণ্টার টাইমলাইন আর unit test সবাই একই হিসাব ব্যবহার করে।

export const SERVER_CAPACITY = 200; // প্রতি সার্ভার, রিকোয়েস্ট/সেকেন্ড
export const DB_CAPACITY = 600; // প্রধান ডাটাবেস (primary), কোয়েরি/সেকেন্ড
export const REPLICA_CAPACITY = 600; // প্রতিটা read replica
export const CACHE_HIT_RATE = 0.8; // Cache চালু থাকলে read-এর ৮০% ডাটাবেসে যায় না
export const MAX_SERVERS = 12;
export const MAX_REPLICAS = 3;
export const MAX_TRAFFIC = 3000;

/** মাসিক খরচ, টাকায় (আন্দাজ, শেখার জন্য) */
export const COST = {
  server: 4000,
  loadBalancer: 2500,
  cache: 3000,
  database: 8000,
  replica: 6000,
} as const;

/** লোডের সীমা: এর নিচে সবুজ, এর ওপরে হলুদ; ১০০%-এর বেশি হলে লাল */
export const WARN_AT = 0.8;

export type ServerState = {
  on: boolean;
  /** চ্যালেঞ্জে নষ্ট সার্ভার: চালু করা যায় না, খরচও নেই */
  crashed?: boolean;
  /** ২৪ ঘণ্টা মোডে: সবে চালু হচ্ছে, এখনো ট্রাফিক নিতে পারে না কিন্তু খরচ হচ্ছে */
  booting?: boolean;
};

export type Config = {
  traffic: number;
  /** মোট রিকোয়েস্টের কত ভাগ ডেটা লেখে (write); বাকিটা শুধু পড়ে (read) */
  writeShare: number;
  servers: ServerState[];
  loadBalancer: boolean;
  cache: boolean;
  replicas: number;
};

export type Health = "ok" | "warn" | "full" | "bad" | "off" | "idle" | "booting";

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
  reads: number;
  writes: number;
  cacheHits: number;
  /** প্রধান ডাটাবেসের লোড (write, আর replica না থাকলে read-ও) */
  dbLoad: number;
  dbUtil: number;
  dbHealth: Health;
  replicaLoad: number; // প্রতিটা replica-র লোড
  replicaUtil: number;
  replicaHealth: Health;
  /** ডাটাবেস স্তরের সবচেয়ে বেশি লোড (primary বা replica) */
  dataUtil: number;
  dbDropped: number;
  successful: number;
  failed: number;
  successRate: number;
  /** গড় লেটেন্সি, মিলিসেকেন্ড (মোটা দাগের আন্দাজ); সিস্টেম বন্ধ হলে null */
  latencyMs: number | null;
  anyServerRed: boolean;
  monthlyCost: number;
};

const EPS = 1e-9;

export function healthOf(util: number): Health {
  if (util > 1 + EPS) return "bad";
  if (util >= 1 - EPS) return "full";
  if (util >= WARN_AT) return "warn";
  return "ok";
}

/** কিউয়িং-এর মোটা দাগের আন্দাজ: লোড যত ক্ষমতার কাছে, অপেক্ষা তত বেশি */
function waitFactor(util: number): number {
  return 1 / (1 - Math.min(util, 0.95));
}

export function costOf(c: Pick<Config, "servers" | "loadBalancer" | "cache" | "replicas">): number {
  const paidServers = c.servers.filter((s) => !s.crashed && (s.on || s.booting)).length;
  return (
    paidServers * COST.server +
    (c.loadBalancer ? COST.loadBalancer : 0) +
    (c.cache ? COST.cache : 0) +
    COST.database +
    c.replicas * COST.replica
  );
}

const serving = (s: ServerState) => s.on && !s.crashed && !s.booting;

export function simulate(config: Config): SimResult {
  const traffic = Math.max(0, config.traffic);
  const writeShare = Math.min(1, Math.max(0, config.writeShare));
  const n = config.servers.length;
  const servers: ServerResult[] = config.servers.map(() => ({
    load: 0,
    served: 0,
    util: 0,
    health: "idle" as Health,
    unreachable: false,
  }));

  const activeIdx = config.servers.map((s, i) => (serving(s) ? i : -1)).filter((i) => i >= 0);

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
    if (!entry || !serving(entry)) down = true;
    else {
      servers[0].load = traffic;
      for (let i = 1; i < n; i++) servers[i].unreachable = true;
    }
  }

  let appServed = 0;
  let anyServerRed = false;
  config.servers.forEach((s, i) => {
    const r = servers[i];
    if (s.booting && !s.crashed) {
      r.health = "booting";
      return;
    }
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
  const writes = appServed * writeShare;
  const reads = appServed - writes;
  const cacheHits = config.cache ? reads * CACHE_HIT_RATE : 0;
  const dbReads = reads - cacheHits;
  const replicas = Math.max(0, Math.min(MAX_REPLICAS, Math.round(config.replicas)));

  // replica থাকলে সব read সেখানে যায়; প্রধান ডাটাবেস শুধু write সামলায়
  const dbLoad = replicas > 0 ? writes : writes + dbReads;
  const replicaLoad = replicas > 0 ? dbReads / replicas : 0;
  const dbUtil = dbLoad / DB_CAPACITY;
  const replicaUtil = replicaLoad / REPLICA_CAPACITY;
  const dbDropped =
    Math.max(0, dbLoad - DB_CAPACITY) + (replicas > 0 ? replicas * Math.max(0, replicaLoad - REPLICA_CAPACITY) : 0);

  const successful = Math.max(0, appServed - dbDropped);
  const failed = traffic - successful;
  const successRate = traffic > 0 ? successful / traffic : down ? 0 : 1;

  let latencyMs: number | null = null;
  if (!down && appServed > 0) {
    let weighted = 0;
    for (const r of servers) weighted += r.served * 12 * waitFactor(r.util);
    const appLatency = weighted / appServed;
    const readDb = 20 * waitFactor(replicas > 0 ? replicaUtil : dbUtil);
    const writeDb = 25 * waitFactor(dbUtil);
    const readLatency = config.cache ? CACHE_HIT_RATE * 2 + (1 - CACHE_HIT_RATE) * readDb : readDb;
    latencyMs = Math.round(appLatency + (1 - writeShare) * readLatency + writeShare * writeDb);
  } else if (!down) {
    latencyMs = 0;
  }

  const dbHealth: Health = down ? "idle" : healthOf(dbUtil);
  const replicaHealth: Health = down || replicas === 0 ? "idle" : healthOf(replicaUtil);
  const dataUtil = Math.max(dbUtil, replicas > 0 ? replicaUtil : 0);

  let status: SystemStatus;
  const healths = [...servers.map((r) => r.health), dbHealth, replicaHealth];
  if (down || (traffic > 0 && successful <= 0)) status = "down";
  else if (successRate < 0.99 || healths.includes("bad")) status = "overloaded";
  else if (healths.includes("warn") || healths.includes("full")) status = "strained";
  else status = "healthy";

  return {
    traffic,
    down: status === "down",
    status,
    servers,
    activeServers: activeIdx.length,
    appServed,
    appDropped,
    reads,
    writes,
    cacheHits,
    dbLoad,
    dbUtil,
    dbHealth,
    replicaLoad,
    replicaUtil,
    replicaHealth,
    dataUtil,
    dbDropped,
    successful,
    failed,
    successRate,
    latencyMs,
    anyServerRed,
    monthlyCost: costOf({ ...config, replicas }),
  };
}

/** N+1 পরীক্ষা: সবচেয়ে ব্যস্ত চালু সার্ভারটা হঠাৎ পড়ে গেলে কী হয় */
export function simulateOneMoreFailure(config: Config): SimResult {
  const base = simulate(config);
  let worst = -1;
  let worstLoad = -1;
  config.servers.forEach((s, i) => {
    if (serving(s) && base.servers[i].load > worstLoad) {
      worst = i;
      worstLoad = base.servers[i].load;
    }
  });
  const servers = config.servers.map((s, i) => (i === worst ? { ...s, on: false } : s));
  return simulate({ ...config, servers });
}

export type Speed = { label: string; health: Health };

/** লেটেন্সিকে কথায়: নির্দিষ্ট ms-এর চেয়ে এটাই বেশি সৎ */
export function speedOf(latencyMs: number | null): Speed {
  if (latencyMs === null) return { label: "সাড়া নেই", health: "bad" };
  if (latencyMs < 80) return { label: "দ্রুত", health: "ok" };
  if (latencyMs < 200) return { label: "একটু ধীর", health: "warn" };
  return { label: "খুব ধীর", health: "bad" };
}

export const makeServers = (count: number, crashedFirst = false): ServerState[] =>
  Array.from({ length: count }, (_, i) => ({ on: !(crashedFirst && i === 0), crashed: crashedFirst && i === 0 }));

/** localStorage থেকে আনা ভাঙা বা পুরোনো ডেটা ঠেকাতে */
export function sanitizeConfig(raw: unknown, fallback: Config): Config {
  if (!raw || typeof raw !== "object") return fallback;
  const o = raw as Record<string, unknown>;
  const num = (v: unknown, lo: number, hi: number, d: number) =>
    typeof v === "number" && isFinite(v) ? Math.min(hi, Math.max(lo, v)) : d;
  const list = Array.isArray(o.servers) ? o.servers.slice(0, MAX_SERVERS) : null;
  const servers: ServerState[] =
    list && list.length > 0
      ? list.map((s) => ({ on: !!(s && typeof s === "object" && (s as ServerState).on) }))
      : fallback.servers;
  return {
    traffic: num(o.traffic, 0, MAX_TRAFFIC, fallback.traffic),
    writeShare: num(o.writeShare, 0, 0.5, fallback.writeShare),
    servers,
    loadBalancer: typeof o.loadBalancer === "boolean" ? o.loadBalancer : fallback.loadBalancer,
    cache: typeof o.cache === "boolean" ? o.cache : fallback.cache,
    replicas: Math.round(num(o.replicas, 0, MAX_REPLICAS, fallback.replicas)),
  };
}
