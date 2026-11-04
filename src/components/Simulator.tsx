"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  CHALLENGES,
  DB_CAPACITY,
  DEFAULT_FREE_CONFIG,
  MAX_SERVERS,
  MAX_TRAFFIC,
  SERVER_CAPACITY,
  TRAFFIC_PRESETS,
  bn,
  goalsMet,
  pct,
  sanitizeConfig,
  simulate,
  type Config,
  type Health,
  type SimResult,
  type SystemStatus,
} from "@/lib/sim";
import { clearSaved, loadSaved, save } from "@/lib/storage";

type Mode = "free" | "challenge";

const STATUS_TEXT: Record<SystemStatus, string> = {
  healthy: "সুস্থ",
  strained: "চাপে আছে",
  overloaded: "ওভারলোড",
  down: "পুরো সিস্টেম বন্ধ",
};

const HEALTH_TEXT: Record<Health, string> = {
  ok: "স্বাভাবিক",
  warn: "চাপে",
  bad: "ওভারলোড",
  off: "বন্ধ",
  idle: "অলস",
};

const tone = (h: Health | SystemStatus) => {
  switch (h) {
    case "ok":
    case "healthy":
      return { fg: "text-ok", bg: "bg-ok-soft", border: "border-ok", bar: "bg-ok", color: "var(--ok)" };
    case "warn":
    case "strained":
      return { fg: "text-warn", bg: "bg-warn-soft", border: "border-warn", bar: "bg-warn", color: "var(--warn)" };
    case "bad":
    case "overloaded":
    case "down":
      return { fg: "text-bad", bg: "bg-bad-soft", border: "border-bad", bar: "bg-bad", color: "var(--bad)" };
    default:
      return { fg: "text-muted", bg: "bg-panel", border: "border-line", bar: "bg-off", color: "var(--off)" };
  }
};

function cloneConfig(c: Config): Config {
  return { ...c, servers: c.servers.map((s) => ({ ...s })) };
}

export default function Simulator() {
  const [mode, setMode] = useState<Mode>("free");
  const [free, setFree] = useState<Config>(() => cloneConfig(DEFAULT_FREE_CONFIG));
  const [chIndex, setChIndex] = useState(0);
  const [chConfig, setChConfig] = useState<Config>(() => cloneConfig(CHALLENGES[0].start));
  const [completed, setCompleted] = useState<string[]>([]);
  const hydrated = useRef(false);

  // সংরক্ষিত অবস্থা ফিরিয়ে আনা (শুধু ব্রাউজারে, hydration-এর পরে)
  useEffect(() => {
    const s = loadSaved();
    if (s.mode === "free" || s.mode === "challenge") setMode(s.mode);
    if (s.free) setFree(sanitizeConfig(s.free, cloneConfig(DEFAULT_FREE_CONFIG)));
    if (typeof s.challengeIndex === "number" && CHALLENGES[s.challengeIndex]) {
      setChIndex(s.challengeIndex);
      setChConfig(cloneConfig(CHALLENGES[s.challengeIndex].start));
    }
    if (Array.isArray(s.completed)) setCompleted(s.completed.filter((x) => typeof x === "string"));
    hydrated.current = true;
  }, []);

  useEffect(() => {
    if (!hydrated.current) return;
    save({ mode, free, challengeIndex: chIndex, completed });
  }, [mode, free, chIndex, completed]);

  const challenge = CHALLENGES[chIndex];
  const config = mode === "free" ? free : chConfig;
  const setConfig = (fn: (c: Config) => Config) =>
    mode === "free" ? setFree((c) => fn(cloneConfig(c))) : setChConfig((c) => fn(cloneConfig(c)));

  const result = useMemo(() => simulate(config), [config]);
  const met = useMemo(() => goalsMet(challenge, chConfig), [challenge, chConfig]);
  const solved = mode === "challenge" && met.every(Boolean);

  useEffect(() => {
    if (solved && !completed.includes(challenge.id)) setCompleted((c) => [...c, challenge.id]);
  }, [solved, challenge.id, completed]);

  const pickChallenge = (i: number) => {
    setChIndex(i);
    setChConfig(cloneConfig(CHALLENGES[i].start));
  };

  const resetCurrent = () => {
    if (mode === "free") setFree(cloneConfig(DEFAULT_FREE_CONFIG));
    else setChConfig(cloneConfig(challenge.start));
  };

  const forgetAll = () => {
    clearSaved();
    setCompleted([]);
    setFree(cloneConfig(DEFAULT_FREE_CONFIG));
    pickChallenge(0);
  };

  return (
    <div className="min-h-screen">
      <header className="border-b border-line bg-panel">
        <div className="gutter mx-auto flex max-w-6xl flex-col gap-4 py-5 sm:flex-row sm:items-end sm:justify-between">
          <div className="min-w-0">
            <p className="eyebrow text-accent">system design lab</p>
            <h1 className="text-2xl font-bold leading-tight sm:text-3xl">Scaling ও System Design সিমুলেটর</h1>
            <p className="mt-1 max-w-xl text-muted">
              ট্রাফিক বাড়াও, সার্ভার যোগ করো, Load Balancer আর Cache বসাও। দেখো কোথায় সিস্টেম ভেঙে পড়ে আর কেন।
            </p>
          </div>
          <div role="tablist" aria-label="মোড" className="flex shrink-0 rounded-lg border border-line bg-paper p-1">
            {(
              [
                ["free", "ফ্রি মোড"],
                ["challenge", "চ্যালেঞ্জ"],
              ] as const
            ).map(([m, label]) => (
              <button
                key={m}
                role="tab"
                id={`tab-${m}`}
                data-testid={`tab-${m}`}
                aria-selected={mode === m}
                onClick={() => setMode(m)}
                className={`flex-1 whitespace-nowrap rounded-md px-4 py-1.5 font-semibold transition-colors sm:flex-none ${
                  mode === m ? "bg-accent text-panel" : "text-muted hover:text-ink"
                }`}
              >
                {label}
                {m === "challenge" && (
                  <span className="ml-1.5 font-mono text-xs opacity-80">
                    {bn(completed.length)}/{bn(CHALLENGES.length)}
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>
      </header>

      <main className="gutter mx-auto grid max-w-6xl gap-5 py-5 lg:grid-cols-[340px_minmax(0,1fr)]">
        {/* মোবাইলে aside "contents" হয়ে যায়, যাতে চ্যালেঞ্জের বিবরণ ডায়াগ্রামের আগে আর নিয়ন্ত্রণ পরে আসে */}
        <aside className="contents lg:col-start-1 lg:row-start-1 lg:flex lg:min-w-0 lg:flex-col lg:gap-4">
          {mode === "challenge" && (
            <div className="order-1 min-w-0 lg:order-none">
              <ChallengePanel
                index={chIndex}
                completed={completed}
                met={met}
                solved={solved}
                onPick={pickChallenge}
              />
            </div>
          )}
          <div className="order-3 min-w-0 lg:order-none">
            <Controls config={config} mode={mode} setConfig={setConfig} onReset={resetCurrent} />
          </div>
          <div className="order-4 min-w-0 lg:order-none">
            <Simplifications />
          </div>
          <button onClick={forgetAll} className="order-5 justify-self-start text-sm text-muted underline underline-offset-2 hover:text-ink lg:order-none lg:self-start">
            সব অগ্রগতি মুছে নতুন করে শুরু
          </button>
        </aside>

        <section className="order-2 flex min-w-0 flex-col gap-4 lg:col-start-2 lg:row-start-1">
          {solved && (
            <SuccessBanner
              title={challenge.title}
              lesson={challenge.lesson}
              allDone={CHALLENGES.every((c) => completed.includes(c.id) || c.id === challenge.id)}
              next={chIndex < CHALLENGES.length - 1 ? () => pickChallenge(chIndex + 1) : undefined}
            />
          )}
          <Metrics r={result} />
          <Diagram r={result} config={config} setConfig={setConfig} />
          <Insights r={result} config={config} />
        </section>
      </main>
    </div>
  );
}

// ---------- মেট্রিক ----------

function Metrics({ r }: { r: SimResult }) {
  const t = tone(r.status);
  const latency =
    r.latencyMs === null ? "—" : r.latencyMs > 999 ? "১০০০+" : bn(r.latencyMs);
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
      <Stat label="সফল রিকোয়েস্ট" value={pct(r.successRate)} testId="success-rate" />
      <Stat label="গড় লেটেন্সি" value={latency} unit="ms" />
      <Stat label="ব্যর্থ রিকোয়েস্ট" value={bn(Math.round(r.failed))} unit="/সে" />
    </div>
  );
}

function Stat({ label, value, unit, testId }: { label: string; value: string; unit?: string; testId?: string }) {
  return (
    <div className="min-w-0 rounded-xl border border-line bg-panel px-3 py-3 sm:px-4">
      <p className="label text-muted">{label}</p>
      <p className="tnum text-lg font-bold leading-tight" data-testid={testId}>
        {value}
        {unit && <span className="ml-1 font-mono text-xs font-normal text-muted">{unit}</span>}
      </p>
    </div>
  );
}

// ---------- ডায়াগ্রাম ----------

function Flow({ amount, color }: { amount: number; color: string }) {
  const still = amount <= 0;
  const dur = still ? 1 : Math.max(0.25, 1.6 - Math.log10(amount + 1) * 0.45);
  return (
    <div
      className="flow"
      data-still={still}
      style={{ ["--flow-dur" as string]: `${dur}s`, ["--flow-color" as string]: color }}
      aria-hidden
    />
  );
}

function UtilBar({ util, health }: { util: number; health: Health }) {
  const t = tone(health);
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-paper" aria-hidden>
      <div className={`h-full ${t.bar} transition-all duration-300`} style={{ width: `${Math.min(100, util * 100)}%` }} />
    </div>
  );
}

function Diagram({
  r,
  config,
  setConfig,
}: {
  r: SimResult;
  config: Config;
  setConfig: (fn: (c: Config) => Config) => void;
}) {
  const statusColor = tone(r.status).color;
  const toggleServer = (i: number) =>
    setConfig((c) => {
      if (c.servers[i].crashed) return c;
      c.servers[i].on = !c.servers[i].on;
      return c;
    });

  return (
    <div className="blueprint overflow-hidden rounded-2xl border border-line p-4 sm:p-6" data-testid="diagram">
      {/* ব্যবহারকারী */}
      <div className="mx-auto flex w-fit items-center gap-3 rounded-full border border-line bg-panel px-4 py-2">
        <UsersIcon />
        <div>
          <p className="label text-muted">ব্যবহারকারী</p>
          <p className="tnum font-bold leading-tight">
            {bn(r.traffic)} <span className="font-mono text-xs font-normal text-muted">req/s</span>
          </p>
        </div>
      </div>
      <Flow amount={r.traffic} color={statusColor} />

      {/* Load Balancer */}
      {config.loadBalancer ? (
        <div
          className={`mx-auto w-full max-w-sm rounded-lg border-2 ${r.down ? "border-bad bg-bad-soft" : "border-accent bg-accent-soft"} px-4 py-2 text-center`}
          data-testid="lb-node"
        >
          <p className="eyebrow text-accent">load balancer</p>
          <p className="text-sm">
            {r.activeServers > 0
              ? `${bn(r.activeServers)}টা চালু সার্ভারে সমান ভাগ (প্রতিটায় ${bn(Math.round(r.traffic / r.activeServers))} req/s)`
              : "পাঠানোর মতো কোনো চালু সার্ভার নেই"}
          </p>
        </div>
      ) : (
        <div className="mx-auto w-full max-w-sm rounded-lg border border-dashed border-line px-4 py-2 text-center text-sm text-muted">
          Load Balancer নেই: সবাই সরাসরি সার্ভার ১-এ যাচ্ছে
        </div>
      )}
      <Flow amount={r.down ? 0 : r.traffic} color={statusColor} />

      {/* সার্ভার */}
      <div className="rounded-xl border border-line bg-paper/60 p-3">
        <div className="mb-2 flex items-baseline justify-between gap-2">
          <p className="label text-muted">অ্যাপ সার্ভার</p>
          <p className="text-xs text-muted">কার্ডে চাপ দিলে সার্ভার বন্ধ/চালু হয়</p>
        </div>
        <ul className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {config.servers.map((s, i) => {
            const sr = r.servers[i];
            const t = tone(sr.health);
            const label = s.crashed ? "ক্র্যাশ" : sr.unreachable && s.on ? "ট্রাফিক পৌঁছায় না" : HEALTH_TEXT[sr.health];
            return (
              <li key={i}>
                <button
                  type="button"
                  id={`server-${i + 1}`}
                  data-testid={`server-${i + 1}`}
                  data-health={sr.health}
                  aria-pressed={s.on && !s.crashed}
                  aria-label={`সার্ভার ${bn(i + 1)}: ${label}. চাপ দিলে ${s.on ? "বন্ধ" : "চালু"} হবে`}
                  disabled={s.crashed}
                  onClick={() => toggleServer(i)}
                  className={`flex w-full flex-col gap-1.5 rounded-lg border-2 ${t.border} ${
                    sr.health === "off" ? "bg-paper opacity-70" : t.bg
                  } p-2.5 text-left transition-colors hover:brightness-[0.98] disabled:cursor-not-allowed`}
                >
                  <span className="flex items-center justify-between gap-1">
                    <span className="font-semibold">সার্ভার {bn(i + 1)}</span>
                    <PowerIcon on={s.on && !s.crashed} />
                  </span>
                  <UtilBar util={sr.util} health={sr.health} />
                  <span className="flex items-baseline justify-between gap-1 text-xs">
                    <span className={`${t.fg} font-semibold`}>{label}</span>
                    {s.on && !s.crashed && !sr.unreachable && !r.down && (
                      <span className="tnum text-muted">{pct(sr.util)}</span>
                    )}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
        <p className="mt-2 text-xs text-muted">
          প্রতিটা সার্ভারের ক্ষমতা {bn(SERVER_CAPACITY)} req/s। মোট সামলানো হচ্ছে {bn(Math.round(r.appServed))}, ফেরত যাচ্ছে{" "}
          {bn(Math.round(r.appDropped))}।
        </p>
      </div>
      <Flow amount={r.appServed} color={statusColor} />

      {/* Cache */}
      {config.cache ? (
        <div className="mx-auto w-full max-w-sm rounded-lg border-2 border-accent bg-accent-soft px-4 py-2 text-center" data-testid="cache-node">
          <p className="eyebrow text-accent">cache · হিট ৮০%</p>
          <p className="tnum text-sm">
            {bn(Math.round(r.cacheHits))} req/s এখান থেকেই উত্তর পায়
          </p>
        </div>
      ) : (
        <div className="mx-auto w-full max-w-sm rounded-lg border border-dashed border-line px-4 py-2 text-center text-sm text-muted">
          Cache নেই: প্রতিটা রিকোয়েস্ট ডাটাবেসে যায়
        </div>
      )}
      <Flow amount={r.dbQueries} color={tone(r.dbHealth).color} />

      {/* Database */}
      <div
        className={`mx-auto w-full max-w-sm rounded-lg border-2 ${tone(r.dbHealth).border} ${tone(r.dbHealth).bg} px-4 py-2.5`}
        data-testid="db-node"
        data-health={r.dbHealth}
        data-util={r.dbUtil.toFixed(3)}
      >
        <div className="flex items-center justify-between gap-2">
          <p className="flex items-center gap-2 font-semibold">
            <DbIcon /> ডাটাবেস
          </p>
          <p className={`tnum text-sm font-semibold ${tone(r.dbHealth).fg}`} data-testid="db-load">
            {pct(r.dbUtil)}
          </p>
        </div>
        <div className="my-1.5">
          <UtilBar util={r.dbUtil} health={r.dbHealth} />
        </div>
        <p className="tnum text-xs text-muted">
          {bn(Math.round(r.dbQueries))} / {bn(DB_CAPACITY)} কোয়েরি প্রতি সেকেন্ডে
        </p>
      </div>
    </div>
  );
}

// ---------- কী ঘটছে ----------

function buildInsights(r: SimResult, c: Config): { tone: Health; text: string }[] {
  const out: { tone: Health; text: string }[] = [];
  if (r.down) {
    if (!c.loadBalancer && (!c.servers[0]?.on || c.servers[0]?.crashed)) {
      out.push({
        tone: "bad",
        text: "সার্ভার ১ বন্ধ, আর Load Balancer না থাকায় ব্যবহারকারীরা অন্য কোনো সার্ভারের ঠিকানা জানে না। একটা সার্ভারই ছিল single point of failure।",
      });
    } else {
      out.push({ tone: "bad", text: "একটাও সার্ভার চালু নেই। কোনো রিকোয়েস্টের উত্তর যাচ্ছে না।" });
    }
    return out;
  }
  const red = r.servers.filter((s) => s.health === "bad");
  if (red.length > 0) {
    out.push({
      tone: "bad",
      text: `${bn(red.length)}টা সার্ভার ক্ষমতার বেশি লোড পাচ্ছে (${pct(Math.max(...red.map((s) => s.util)))})। বাড়তি রিকোয়েস্ট ফেরত যাচ্ছে।`,
    });
  }
  const idle = r.servers.filter((s, i) => s.unreachable && c.servers[i].on && !c.servers[i].crashed).length;
  if (!c.loadBalancer && idle > 0) {
    out.push({
      tone: "warn",
      text: `${bn(idle)}টা সার্ভার চালু থেকেও বসে আছে। Load Balancer ছাড়া তাদের কাছে কেউ পৌঁছায় না।`,
    });
  }
  if (r.dbHealth === "bad") {
    out.push({
      tone: "bad",
      text: c.cache
        ? "Cache থাকার পরও ডাটাবেস ওভারলোড। এই সিমুলেটরে এটাই শেষ সীমা; বাস্তবে read replica বা sharding লাগত।"
        : "ডাটাবেস ওভারলোড। সার্ভার বাড়ালে এটা মিটবে না, কারণ সব সার্ভার একই ডাটাবেসে যায়। Cache চালু করে দেখো।",
    });
  } else if (r.dbHealth === "warn") {
    out.push({ tone: "warn", text: `ডাটাবেস ${pct(r.dbUtil)} লোডে, সীমার কাছাকাছি।` });
  }
  if (c.cache && r.cacheHits > 0) {
    out.push({
      tone: "ok",
      text: `Cache ${bn(Math.round(r.cacheHits))} req/s নিজেই সামলাচ্ছে, তাই ডাটাবেসে যাচ্ছে মাত্র ${bn(Math.round(r.dbQueries))}।`,
    });
  }
  if (out.length === 0) {
    out.push({
      tone: "ok",
      text: r.traffic === 0 ? "কোনো ট্রাফিক নেই। স্লাইডার টেনে ট্রাফিক বাড়াও।" : "সব ঠিকঠাক চলছে। ট্রাফিক আরও বাড়িয়ে দেখো কোথায় প্রথম চাপ পড়ে।",
    });
  }
  return out;
}

function Insights({ r, config }: { r: SimResult; config: Config }) {
  const list = buildInsights(r, config);
  return (
    <div className="rounded-xl border border-line bg-panel p-4" aria-live="polite" data-testid="insights">
      <p className="label mb-2 text-muted">কী ঘটছে</p>
      <ul className="flex flex-col gap-2">
        {list.map((it, i) => (
          <li key={i} className="flex gap-2.5">
            <span className={`mt-2 h-2 w-2 shrink-0 rounded-full ${tone(it.tone).bar}`} aria-hidden />
            <span className="min-w-0">{it.text}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ---------- নিয়ন্ত্রণ ----------

function Toggle({
  id,
  label,
  desc,
  checked,
  onChange,
}: {
  id: string;
  label: string;
  desc: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label htmlFor={id} className="flex cursor-pointer items-start justify-between gap-3">
      <span className="min-w-0">
        <span className="block font-semibold">{label}</span>
        <span className="block text-sm text-muted">{desc}</span>
      </span>
      <span className="relative mt-1 inline-flex shrink-0">
        <input
          id={id}
          data-testid={id}
          type="checkbox"
          role="switch"
          className="peer sr-only"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
        />
        <span className="h-6 w-11 rounded-full border border-line bg-paper transition-colors peer-checked:border-accent peer-checked:bg-accent peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-accent" />
        <span className="pointer-events-none absolute left-1 top-1 h-4 w-4 rounded-full bg-off transition-transform peer-checked:translate-x-5 peer-checked:bg-panel" />
      </span>
    </label>
  );
}

function Controls({
  config,
  mode,
  setConfig,
  onReset,
}: {
  config: Config;
  mode: Mode;
  setConfig: (fn: (c: Config) => Config) => void;
  onReset: () => void;
}) {
  const locked = mode === "challenge";
  const count = config.servers.length;
  return (
    <div className="flex flex-col gap-5 rounded-xl border border-line bg-panel p-4">
      <div>
        <div className="flex items-baseline justify-between gap-2">
          <label htmlFor="traffic" className="font-semibold">
            ট্রাফিক
          </label>
          <span className="tnum font-bold" data-testid="traffic-value">
            {bn(config.traffic)} <span className="font-mono text-xs font-normal text-muted">req/s</span>
          </span>
        </div>
        <input
          id="traffic"
          data-testid="traffic"
          type="range"
          min={0}
          max={MAX_TRAFFIC}
          step={10}
          value={config.traffic}
          disabled={locked}
          onChange={(e) => {
            const v = Number(e.target.value);
            setConfig((c) => ({ ...c, traffic: v }));
          }}
          className="mt-2 w-full disabled:opacity-50"
        />
        {locked ? (
          <p className="text-sm text-muted">চ্যালেঞ্জে ট্রাফিক নির্দিষ্ট। বাকিটা তোমার হাতে।</p>
        ) : (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {TRAFFIC_PRESETS.map((p) => (
              <button
                key={p.value}
                type="button"
                onClick={() => setConfig((c) => ({ ...c, traffic: p.value }))}
                className={`rounded-full border px-2.5 py-0.5 text-sm transition-colors ${
                  config.traffic === p.value ? "border-accent bg-accent-soft text-accent" : "border-line text-muted hover:text-ink"
                }`}
              >
                {p.label} <span className="tnum">{bn(p.value)}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      <div>
        <div className="flex items-center justify-between gap-3">
          <span className="min-w-0">
            <span className="block font-semibold">অ্যাপ সার্ভার</span>
            <span className="block text-sm text-muted">প্রতিটা {bn(SERVER_CAPACITY)} req/s সামলায়</span>
          </span>
          <div className="flex shrink-0 items-center gap-1">
            <button
              type="button"
              id="remove-server"
              data-testid="remove-server"
              aria-label="একটা সার্ভার সরাও"
              disabled={count <= 1 || !!config.servers[count - 1]?.crashed}
              onClick={() => setConfig((c) => ({ ...c, servers: c.servers.slice(0, -1) }))}
              className="h-9 w-9 rounded-lg border border-line text-lg font-bold hover:border-accent disabled:opacity-40"
            >
              −
            </button>
            <span className="tnum w-8 text-center text-lg font-bold" data-testid="server-count">
              {bn(count)}
            </span>
            <button
              type="button"
              id="add-server"
              data-testid="add-server"
              aria-label="একটা সার্ভার যোগ করো"
              disabled={count >= MAX_SERVERS}
              onClick={() => setConfig((c) => ({ ...c, servers: [...c.servers, { on: true }] }))}
              className="h-9 w-9 rounded-lg border border-line text-lg font-bold hover:border-accent disabled:opacity-40"
            >
              +
            </button>
          </div>
        </div>
      </div>

      <Toggle
        id="toggle-lb"
        label="Load Balancer"
        desc="ট্রাফিক সব চালু সার্ভারে সমান ভাগ করে, বন্ধ সার্ভার বাদ দেয়"
        checked={config.loadBalancer}
        onChange={(v) => setConfig((c) => ({ ...c, loadBalancer: v }))}
      />
      <Toggle
        id="toggle-cache"
        label="Cache"
        desc="বারবার চাওয়া ডেটা মেমোরিতে রাখে; ৮০% রিকোয়েস্ট ডাটাবেসে যায় না"
        checked={config.cache}
        onChange={(v) => setConfig((c) => ({ ...c, cache: v }))}
      />

      <button
        type="button"
        onClick={onReset}
        className="self-start rounded-lg border border-line px-3 py-1.5 text-sm font-semibold hover:border-accent"
      >
        {locked ? "চ্যালেঞ্জ আবার শুরু" : "শুরুর অবস্থায় ফেরো"}
      </button>
    </div>
  );
}

// ---------- চ্যালেঞ্জ ----------

function ChallengePanel({
  index,
  completed,
  met,
  solved,
  onPick,
}: {
  index: number;
  completed: string[];
  met: boolean[];
  solved: boolean;
  onPick: (i: number) => void;
}) {
  const ch = CHALLENGES[index];
  const [showHint, setShowHint] = useState(false);
  useEffect(() => setShowHint(false), [index]);
  return (
    <div className="flex flex-col gap-3 rounded-xl border border-line bg-panel p-4" data-testid="challenge-panel">
      <div className="flex gap-1.5" role="list">
        {CHALLENGES.map((c, i) => {
          const done = completed.includes(c.id);
          return (
            <button
              key={c.id}
              role="listitem"
              type="button"
              data-testid={`pick-challenge-${i + 1}`}
              onClick={() => onPick(i)}
              aria-current={i === index}
              className={`flex-1 rounded-lg border px-2 py-1.5 text-sm font-semibold transition-colors ${
                i === index ? "border-accent bg-accent-soft text-accent" : "border-line text-muted hover:text-ink"
              }`}
            >
              {done ? "✓ " : ""}
              {bn(i + 1)}
            </button>
          );
        })}
      </div>
      <div>
        <p className="label text-muted">চ্যালেঞ্জ {bn(index + 1)}</p>
        <h2 className="text-xl font-bold">{ch.title}</h2>
        <p className="mt-1">{ch.story}</p>
      </div>
      <div>
        <p className="label mb-1.5 text-muted">লক্ষ্য</p>
        <ul className="flex flex-col gap-1.5" data-testid="goals">
          {ch.goals.map((g, i) => (
            <li key={g.id} className="flex items-start gap-2" data-met={met[i]}>
              <span
                className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 text-xs font-bold ${
                  met[i] ? "border-ok bg-ok text-panel" : "border-line text-transparent"
                }`}
                aria-hidden
              >
                ✓
              </span>
              <span className={met[i] ? "" : "text-muted"}>
                {g.label}
                <span className="sr-only">{met[i] ? " (পূরণ হয়েছে)" : " (এখনো হয়নি)"}</span>
              </span>
            </li>
          ))}
        </ul>
      </div>
      {!solved &&
        (showHint ? (
          <p className="rounded-lg bg-warn-soft px-3 py-2 text-sm">{ch.hint}</p>
        ) : (
          <button type="button" onClick={() => setShowHint(true)} className="self-start text-sm font-semibold text-accent underline underline-offset-2">
            ইঙ্গিত দেখাও
          </button>
        ))}
    </div>
  );
}

function SuccessBanner({ title, lesson, next, allDone }: { title: string; lesson: string; next?: () => void; allDone: boolean }) {
  return (
    <div role="status" data-testid="success-banner" className="flex flex-col gap-2 rounded-xl border-2 border-ok bg-ok-soft p-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <p className="text-lg font-bold text-ok">সফল! “{title}” চ্যালেঞ্জ সমাধান হয়েছে।</p>
        <p className="text-sm">{lesson}</p>
        {allDone && !next && <p className="mt-1 text-sm font-semibold">তিনটা চ্যালেঞ্জই শেষ। এবার ফ্রি মোডে নিজের মতো করে ভেঙে দেখো।</p>}
      </div>
      {next && (
        <button type="button" onClick={next} data-testid="next-challenge" className="shrink-0 rounded-lg bg-ok px-4 py-2 font-semibold text-panel">
          পরের চ্যালেঞ্জ →
        </button>
      )}
    </div>
  );
}

function Simplifications() {
  return (
    <details className="rounded-xl border border-line bg-panel p-4 text-sm">
      <summary className="cursor-pointer font-semibold">এই সিমুলেটর কোথায় সরল করা হয়েছে</summary>
      <ul className="mt-2 list-disc space-y-1 pl-5 text-muted">
        <li>সব সার্ভার একই রকম, ক্ষমতা ঠিক {bn(SERVER_CAPACITY)} req/s; বাস্তবে CPU, মেমোরি, রিকোয়েস্টের ধরন অনুযায়ী বদলায়।</li>
        <li>Load Balancer ট্রাফিক একদম সমান ভাগ করে, নিজে কখনো ভাঙে না, আর সার্ভার বন্ধ হলে সঙ্গে সঙ্গে টের পায়।</li>
        <li>Cache-এর হিট রেট সবসময় ৮০%; বাস্তবে এটা ডেটার ধরন, TTL আর মেমোরির ওপর নির্ভর করে।</li>
        <li>প্রতিটা রিকোয়েস্টে ঠিক একটা ডাটাবেস কোয়েরি; লেখা (write) আলাদা করে ধরা হয়নি।</li>
        <li>লেটেন্সি একটা মোটা দাগের queueing আন্দাজ, নেটওয়ার্ক দেরি নেই।</li>
        <li>সব হিসাব সঙ্গে সঙ্গে স্থির অবস্থায় পৌঁছায়; ধীরে ধীরে ভিড় জমা বা retry-এর ঝড় নেই।</li>
      </ul>
    </details>
  );
}

// ---------- আইকন ----------

function UsersIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-accent" aria-hidden>
      <circle cx="9" cy="8" r="3.2" fill="none" />
      <path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6" fill="none" />
      <circle cx="17" cy="9" r="2.6" fill="none" />
      <path d="M16 14.2c2.8.3 5 2.6 5 5.8" fill="none" />
    </svg>
  );
}

function DbIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <ellipse cx="12" cy="5.5" rx="7.5" ry="2.8" fill="none" />
      <path d="M4.5 5.5v13c0 1.5 3.4 2.8 7.5 2.8s7.5-1.3 7.5-2.8v-13" fill="none" />
      <path d="M4.5 12c0 1.5 3.4 2.8 7.5 2.8s7.5-1.3 7.5-2.8" fill="none" />
    </svg>
  );
}

function PowerIcon({ on }: { on: boolean }) {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className={on ? "text-ok" : "text-off"} aria-hidden>
      <path d="M12 3v8" />
      <path d="M6.3 7.5a8 8 0 1 0 11.4 0" fill="none" />
    </svg>
  );
}
