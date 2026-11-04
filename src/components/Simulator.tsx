"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { makeServers, sanitizeConfig, simulate, type Config } from "@/lib/model";
import { CHALLENGES, contextFor, goalsMet, starsFor } from "@/lib/challenges";
import { DEFAULT_DAY, TICKS, runDay, sanitizeDay, type DayConfig } from "@/lib/timeline";
import { bn, clock, compact, pct, taka } from "@/lib/format";
import { clearSaved, loadSaved, save } from "@/lib/storage";
import Diagram from "./Diagram";
import Metrics from "./Metrics";
import Insights, { dayInsights, steadyInsights } from "./Insights";
import DayChart, { HourlyTable } from "./DayChart";
import { DayControls, ForgetAll, SteadyControls } from "./Controls";
import { ChallengePanel, Intro, MobileBar, SuccessBanner } from "./Challenge";

type Mode = "free" | "day" | "challenge";
type AnyConfig = Config | DayConfig;

const DEFAULT_FREE: Config = { traffic: 150, writeShare: 0.1, servers: makeServers(1), loadBalancer: false, cache: false, replicas: 0 };

const clone = <T,>(c: T): T => JSON.parse(JSON.stringify(c)) as T;

const MODES: [Mode, string][] = [
  ["free", "ফ্রি মোড"],
  ["day", "২৪ ঘণ্টা"],
  ["challenge", "চ্যালেঞ্জ"],
];

/** চার্টে শুরুতে কোন মুহূর্ত দেখাবে: সবচেয়ে খারাপ, না থাকলে সবচেয়ে ব্যস্ত */
function focusTick(day: ReturnType<typeof runDay>): number {
  let worst = -1;
  let worstRate = 1;
  for (const t of day.ticks) {
    if (t.result.successRate < worstRate - 1e-9) {
      worst = t.index;
      worstRate = t.result.successRate;
    }
  }
  if (worst >= 0) return worst;
  return day.ticks.reduce((best, t) => (t.traffic > day.ticks[best].traffic ? t.index : best), 0);
}

export default function Simulator() {
  const [mode, setMode] = useState<Mode>("free");
  const [free, setFree] = useState<Config>(() => clone(DEFAULT_FREE));
  const [dayCfg, setDayCfg] = useState<DayConfig>(() => clone(DEFAULT_DAY));
  const [chIndex, setChIndex] = useState(0);
  const [chConfig, setChConfig] = useState<AnyConfig>(() => clone(CHALLENGES[0].start));
  const [stars, setStars] = useState<Record<string, number>>({});
  const [introSeen, setIntroSeen] = useState(true);
  const [cursor, setCursor] = useState(120);
  const [playing, setPlaying] = useState(false);
  const hydrated = useRef(false);

  // সংরক্ষিত অবস্থা ফিরিয়ে আনা (শুধু ব্রাউজারে, hydration-এর পরে)
  useEffect(() => {
    const s = loadSaved();
    if (s.mode === "free" || s.mode === "day" || s.mode === "challenge") setMode(s.mode);
    if (s.free) setFree(sanitizeConfig(s.free, clone(DEFAULT_FREE)));
    if (s.day) setDayCfg(sanitizeDay(s.day, clone(DEFAULT_DAY)));
    if (typeof s.challengeIndex === "number" && CHALLENGES[s.challengeIndex]) {
      setChIndex(s.challengeIndex);
      setChConfig(clone(CHALLENGES[s.challengeIndex].start));
    }
    if (s.stars && typeof s.stars === "object") {
      const ok: Record<string, number> = {};
      for (const [k, v] of Object.entries(s.stars)) if (typeof v === "number" && v >= 1 && v <= 3) ok[k] = Math.round(v);
      setStars(ok);
    }
    setIntroSeen(s.introSeen === true);
    hydrated.current = true;
  }, []);

  useEffect(() => {
    if (!hydrated.current) return;
    save({ mode, free, day: dayCfg, challengeIndex: chIndex, stars, introSeen });
  }, [mode, free, dayCfg, chIndex, stars, introSeen]);

  const challenge = CHALLENGES[chIndex];
  const inChallenge = mode === "challenge";
  const isDay = mode === "day" || (inChallenge && challenge.kind === "day");

  const activeDayCfg = (mode === "day" ? dayCfg : chConfig) as DayConfig;
  const steadyCfg = (mode === "free" ? free : chConfig) as Config;

  const day = useMemo(() => (isDay ? runDay(activeDayCfg) : null), [isDay, activeDayCfg]);
  const steady = useMemo(() => (isDay ? null : simulate(steadyCfg)), [isDay, steadyCfg]);

  const ctx = useMemo(() => contextFor(challenge, chConfig), [challenge, chConfig]);
  const met = useMemo(() => goalsMet(challenge, ctx), [challenge, ctx]);
  const solved = inChallenge && met.every(Boolean);
  const earned = solved ? starsFor(challenge, ctx.cost) : 0;

  useEffect(() => {
    if (solved && (stars[challenge.id] ?? 0) < earned) setStars((s) => ({ ...s, [challenge.id]: earned }));
  }, [solved, earned, challenge.id, stars]);

  // দিনের ধরন বা চ্যালেঞ্জ বদলালে চার্টের সবচেয়ে গুরুত্বপূর্ণ মুহূর্তে যাওয়া
  const focusKey = isDay ? `${mode}:${chIndex}:${activeDayCfg.pattern}` : "";
  useEffect(() => {
    if (day) setCursor(focusTick(day));
    setPlaying(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusKey]);

  // ২৪ ঘণ্টা চালানো
  useEffect(() => {
    if (!playing) return;
    const id = window.setInterval(() => {
      setCursor((c) => {
        if (c >= TICKS - 1) {
          setPlaying(false);
          return c;
        }
        return c + 1;
      });
    }, 70);
    return () => window.clearInterval(id);
  }, [playing]);

  const pickChallenge = (i: number) => {
    setChIndex(i);
    setChConfig(clone(CHALLENGES[i].start));
  };

  const resetCurrent = () => {
    if (mode === "free") setFree(clone(DEFAULT_FREE));
    else if (mode === "day") setDayCfg(clone(DEFAULT_DAY));
    else setChConfig(clone(challenge.start));
  };

  const forgetAll = () => {
    clearSaved();
    setStars({});
    setFree(clone(DEFAULT_FREE));
    setDayCfg(clone(DEFAULT_DAY));
    setIntroSeen(false);
    pickChallenge(0);
  };

  const setSteady = (fn: (c: Config) => Config) =>
    mode === "free" ? setFree((c) => fn(clone(c))) : setChConfig((c) => fn(clone(c as Config)));
  const setDay = (fn: (c: DayConfig) => DayConfig) =>
    mode === "day" ? setDayCfg((c) => fn(clone(c))) : setChConfig((c) => fn(clone(c as DayConfig)));

  const tick = day ? day.ticks[Math.min(cursor, TICKS - 1)] : null;
  const result = tick ? tick.result : steady!;
  const cost = day ? day.monthlyCost : steady!.monthlyCost;
  const budget = inChallenge ? challenge.budget : undefined;
  const totalStars = Object.values(stars).reduce((a, b) => a + b, 0);

  const toggleServer = (i: number) =>
    setSteady((c) => {
      if (!c.servers[i].crashed) c.servers[i].on = !c.servers[i].on;
      return c;
    });

  return (
    <div className="min-h-screen pb-16 lg:pb-0">
      <header className="border-b border-line bg-panel">
        <div className="gutter mx-auto flex max-w-6xl flex-col gap-4 py-5 sm:flex-row sm:items-end sm:justify-between">
          <div className="min-w-0">
            <h1 className="text-2xl font-bold leading-tight sm:text-3xl">Scaling ও System Design সিমুলেটর</h1>
            <p className="mt-1 max-w-xl text-muted">
              ট্রাফিক বাড়াও, সার্ভার যোগ করো, Load Balancer আর Cache বসাও। দেখো কোথায় সিস্টেম ভেঙে পড়ে, কেন, আর কত খরচে ঠিক হয়।
            </p>
          </div>
          <div role="tablist" aria-label="মোড" className="flex shrink-0 rounded-lg border border-line bg-paper p-1">
            {MODES.map(([m, label]) => (
              <button
                key={m}
                role="tab"
                id={`tab-${m}`}
                data-testid={`tab-${m}`}
                aria-selected={mode === m}
                onClick={() => setMode(m)}
                className={`flex-1 whitespace-nowrap rounded-md px-3 py-1.5 font-semibold transition-colors sm:flex-none sm:px-4 ${
                  mode === m ? "bg-accent text-panel" : "text-muted hover:text-ink"
                }`}
              >
                {label}
                {m === "challenge" && (
                  <span className="ml-1.5 text-xs opacity-80" aria-label={`${bn(totalStars)} তারা`}>
                    ★{bn(totalStars)}
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>
      </header>

      <main className="gutter mx-auto grid max-w-6xl gap-5 py-5 lg:grid-cols-[340px_minmax(0,1fr)]">
        {!introSeen && (
          <div className="order-first min-w-0 lg:col-span-2">
            <Intro
              onClose={() => setIntroSeen(true)}
              onChallenge={() => {
                setIntroSeen(true);
                setMode("challenge");
              }}
            />
          </div>
        )}

        {/* মোবাইলে aside "contents" হয়ে যায়: চ্যালেঞ্জের বিবরণ আগে, তারপর ফল, তারপর নিয়ন্ত্রণ */}
        <aside className={`contents lg:col-start-1 ${introSeen ? "lg:row-start-1" : "lg:row-start-2"} lg:flex lg:min-w-0 lg:flex-col lg:gap-4`}>
          {inChallenge && (
            <div className="order-1 min-w-0 lg:order-none">
              <ChallengePanel index={chIndex} stars={stars} met={met} solved={solved} onPick={pickChallenge} />
            </div>
          )}
          <div className="order-3 min-w-0 lg:order-none">
            {isDay ? (
              <DayControls config={activeDayCfg} setConfig={setDay} locked={inChallenge} onReset={resetCurrent} />
            ) : (
              <SteadyControls config={steadyCfg} setConfig={setSteady} locked={inChallenge} onReset={resetCurrent} />
            )}
          </div>
          <div className="order-4 min-w-0 lg:order-none">
            <Simplifications />
          </div>
          <div className="order-5 min-w-0 lg:order-none">
            <ForgetAll onConfirm={forgetAll} />
          </div>
        </aside>

        <section className={`order-2 flex min-w-0 flex-col gap-4 lg:col-start-2 ${introSeen ? "lg:row-start-1" : "lg:row-start-2"}`}>
          {solved && (
            <SuccessBanner
              ch={challenge}
              stars={earned}
              cost={ctx.cost}
              status={
                ctx.kind === "steady"
                  ? ctx.result.status
                  : ctx.day.ticks.some((t) => t.result.status === "strained" || t.result.status === "overloaded")
                    ? "strained"
                    : "healthy"
              }
              isDay={ctx.kind === "day"}
              allDone={CHALLENGES.every((c) => (stars[c.id] ?? 0) > 0 || c.id === challenge.id)}
              next={chIndex < CHALLENGES.length - 1 ? () => pickChallenge(chIndex + 1) : undefined}
            />
          )}

          {day && tick ? (
            <>
              <DayPanel
                day={day}
                cursor={cursor}
                setCursor={(i) => {
                  setPlaying(false);
                  setCursor(i);
                }}
                playing={playing}
                setPlaying={(p) => {
                  if (p && cursor >= TICKS - 1) setCursor(0);
                  setPlaying(p);
                }}
                cfg={activeDayCfg}
                budget={budget}
              />
              <Insights items={dayInsights(day, activeDayCfg)} />
              <h2 className="text-base font-bold">
                {clock(tick.minute)}-এর অবস্থা
                <span className="ml-2 text-sm font-normal text-muted">চার্টে চাপ দিয়ে বা টেনে অন্য সময় দেখো</span>
              </h2>
              <Metrics r={result} cost={cost} budget={budget} costNote="সারাদিনের গড় হারে" />
              <Diagram
                r={result}
                servers={tick.servers}
                loadBalancer={activeDayCfg.loadBalancer}
                cache={activeDayCfg.cache}
                replicas={activeDayCfg.replicas}
                serverNote={activeDayCfg.autoscale.enabled ? "সার্ভারের সংখ্যা autoscaler ঠিক করছে" : "সারাদিন একই সংখ্যক সার্ভার চলে"}
              />
            </>
          ) : (
            <>
              <Metrics r={result} cost={cost} budget={budget} />
              <Insights items={steadyInsights(result, steadyCfg)} />
              <Diagram
                r={result}
                servers={steadyCfg.servers}
                loadBalancer={steadyCfg.loadBalancer}
                cache={steadyCfg.cache}
                replicas={steadyCfg.replicas}
                onToggleServer={toggleServer}
              />
            </>
          )}
        </section>
      </main>

      <MobileBar
        status={result.status}
        success={day ? day.successRate : result.successRate}
        cost={cost}
        budget={budget}
        extra={day ? "সারাদিন" : undefined}
      />
    </div>
  );
}

function DayPanel({
  day,
  cursor,
  setCursor,
  playing,
  setPlaying,
  cfg,
  budget,
}: {
  day: ReturnType<typeof runDay>;
  cursor: number;
  setCursor: (i: number) => void;
  playing: boolean;
  setPlaying: (p: boolean) => void;
  cfg: DayConfig;
  budget?: number;
}) {
  const over = budget !== undefined && day.monthlyCost > budget;
  const worst = focusTick(day);
  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-line bg-panel p-4" data-testid="day-panel">
      <div className="grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-4">
        <Summary label="পুরো দিনে সফল" testId="day-success" value={pct(day.successRate)} bad={day.successRate < 0.99} />
        <Summary label="ফেরত গেছে" value={day.dropped < 1 ? "০" : compact(day.dropped)} note="রিকোয়েস্ট" bad={day.dropped >= 1} />
        <Summary label="মাসিক খরচ" testId="day-cost" value={taka(day.monthlyCost)} note={budget !== undefined ? `বাজেট ${taka(budget)}` : undefined} bad={over} />
        <Summary label="সার্ভার" value={`গড় ${bn(day.avgPaidServers, 1)}`} note={`সর্বোচ্চ ${bn(day.peakServers)}`} />
      </div>
      <DayChart day={day} cursor={cursor} onCursor={setCursor} prewarm={cfg.autoscale.enabled && cfg.prewarm.enabled ? cfg.prewarm : null} />
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          data-testid="play"
          onClick={() => setPlaying(!playing)}
          className="rounded-lg bg-accent px-3 py-1.5 text-sm font-semibold text-panel"
        >
          {playing ? "⏸ থামাও" : "▶ দিনটা চালাও"}
        </button>
        <label htmlFor="scrub" className="sr-only">
          সময় বাছাই
        </label>
        <input
          id="scrub"
          data-testid="scrub"
          type="range"
          min={0}
          max={TICKS - 1}
          value={cursor}
          onChange={(e) => setCursor(Number(e.target.value))}
          className="min-w-0 flex-1"
          aria-valuetext={clock(day.ticks[cursor].minute)}
        />
        <span className="tnum w-24 text-right text-sm font-semibold">{clock(day.ticks[cursor].minute)}</span>
        {day.successRate < 1 && cursor !== worst && (
          <button type="button" onClick={() => setCursor(worst)} className="text-sm font-semibold text-accent underline underline-offset-2">
            সবচেয়ে খারাপ মুহূর্তে যাও
          </button>
        )}
      </div>
      <HourlyTable day={day} />
    </div>
  );
}

function Summary({ label, value, note, bad, testId }: { label: string; value: string; note?: string; bad?: boolean; testId?: string }) {
  return (
    <div className="min-w-0">
      <p className="label text-muted">{label}</p>
      <p className={`tnum text-lg font-bold leading-tight ${bad ? "text-bad" : ""}`} data-testid={testId}>
        {value}
      </p>
      {note && <p className={`tnum text-xs ${bad ? "font-semibold text-bad" : "text-muted"}`}>{note}</p>}
    </div>
  );
}

function Simplifications() {
  return (
    <details className="rounded-xl border border-line bg-panel p-4 text-sm">
      <summary className="cursor-pointer font-semibold">এই সিমুলেটর কোথায় সরল করা হয়েছে</summary>
      <ul className="mt-2 list-disc space-y-1 pl-5 text-muted">
        <li>সব সার্ভার একই রকম, ক্ষমতা ঠিক ২০০ req/s; বাস্তবে CPU, মেমোরি আর রিকোয়েস্টের ধরন অনুযায়ী বদলায়।</li>
        <li>Load Balancer ট্রাফিক একদম সমান ভাগ করে, নিজে কখনো নষ্ট হয় না, আর সার্ভার বন্ধ হলে সঙ্গে সঙ্গে টের পায়।</li>
        <li>Cache-এর হিট রেট সবসময় read-এর ৮০%; বাস্তবে ডেটার ধরন, TTL আর মেমোরির ওপর নির্ভর করে। Cache খালি থেকে ভরতে সময় লাগে, সেটাও ধরা হয়নি।</li>
        <li>প্রতিটা রিকোয়েস্টে ঠিক একটা ডাটাবেস কোয়েরি। Replica-তে ডেটা পৌঁছানোর দেরি (replication lag) আর sharding নেই।</li>
        <li>গতি একটা মোটা দাগের queueing আন্দাজ, নেটওয়ার্কের দেরি নেই।</li>
        <li>২৪ ঘণ্টা মোডে হিসাব প্রতি ১০ মিনিটে একবার। নতুন সার্ভার চালু হতে ঠিক ১০ মিনিট লাগে; বাস্তবে কয়েক সেকেন্ড (container) থেকে কয়েক মিনিট (VM)।</li>
        <li>ব্যর্থ রিকোয়েস্ট আবার চেষ্টা (retry) করে না; বাস্তবে retry-এর ঝড় ভিড় আরও বাড়িয়ে দেয়।</li>
        <li>খরচগুলো শেখার জন্য বানানো আন্দাজ, কোনো নির্দিষ্ট ক্লাউডের দাম নয়।</li>
      </ul>
    </details>
  );
}
