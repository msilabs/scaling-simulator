"use client";

import { useEffect, useState } from "react";
import { CHALLENGES, type Challenge } from "@/lib/challenges";
import type { SystemStatus } from "@/lib/model";
import { bn, pct, taka } from "@/lib/format";
import { STATUS_TEXT, Stars, tone } from "./ui";

export function ChallengePanel({
  index,
  stars,
  met,
  solved,
  onPick,
}: {
  index: number;
  stars: Record<string, number>;
  met: boolean[];
  solved: boolean;
  onPick: (i: number) => void;
}) {
  const ch = CHALLENGES[index];
  const [showHint, setShowHint] = useState(false);
  useEffect(() => setShowHint(false), [index]);
  return (
    <div className="flex flex-col gap-3 rounded-xl border border-line bg-panel p-4" data-testid="challenge-panel">
      <div className="grid grid-cols-6 gap-1" aria-label="চ্যালেঞ্জ বাছাই">
        {CHALLENGES.map((c, i) => {
          const s = stars[c.id] ?? 0;
          return (
            <button
              key={c.id}
              type="button"
              data-testid={`pick-challenge-${i + 1}`}
              onClick={() => onPick(i)}
              aria-current={i === index}
              aria-label={`চ্যালেঞ্জ ${bn(i + 1)}: ${c.title}${s ? `, ${bn(s)} তারা` : ""}`}
              className={`flex flex-col items-center rounded-lg border px-1 py-1 text-sm font-semibold transition-colors ${
                i === index ? "border-accent bg-accent-soft text-accent" : "border-line text-muted hover:text-ink"
              }`}
            >
              {bn(i + 1)}
              <span className="text-[10px] leading-none">
                <Stars count={s} size="text-[10px]" />
              </span>
            </button>
          );
        })}
      </div>
      <div>
        <p className="label text-muted">
          চ্যালেঞ্জ {bn(index + 1)} · {ch.concept}
        </p>
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
                {g.id === "budget" ? `${g.label} (${taka(ch.budget)})` : g.label}
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

export function SuccessBanner({
  ch,
  stars,
  cost,
  status,
  next,
  allDone,
  isDay,
}: {
  ch: Challenge;
  stars: number;
  cost: number;
  status: SystemStatus | null;
  isDay?: boolean;
  next?: () => void;
  allDone: boolean;
}) {
  return (
    <div role="status" data-testid="success-banner" className="flex flex-col gap-3 rounded-xl border-2 border-ok bg-ok-soft p-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <p className="text-lg font-bold text-ok">সফল! “{ch.title}” সমাধান হয়েছে।</p>
          <p className="flex flex-wrap items-center gap-x-2 text-sm">
            <Stars count={stars} size="text-xl" />
            <span className="tnum">
              খরচ {taka(cost)}/মাস।{" "}
              {stars < 3 ? `আরও কম খরচে সম্ভব: সেরা জানা সমাধান ${taka(ch.par)}-এর মধ্যে।` : "সবচেয়ে সাশ্রয়ী সমাধান!"}
            </span>
          </p>
        </div>
        {next && (
          <button type="button" onClick={next} data-testid="next-challenge" className="shrink-0 rounded-lg bg-ok px-4 py-2 font-semibold text-panel">
            পরের চ্যালেঞ্জ →
          </button>
        )}
      </div>
      {status === "strained" && (
        <p className="rounded-lg bg-panel/70 px-3 py-2 text-sm">
          {isDay
            ? "লক্ষ্য পূরণ হয়েছে, তবে ভিড়ের সময় কিছু অংশ ৮০% বা তার বেশি লোডে ছিল, তাই গতি কমে গিয়েছিল। বাস্তবে এর ওপর আরেকটু জায়গা রাখা ভালো; চার্টে সেই সময়টা টেনে দেখো।"
            : `লক্ষ্য পূরণ হয়েছে, তবে কিছু অংশ ৮০%-এর বেশি লোডে আছে, তাই অবস্থা “${STATUS_TEXT.strained}”। বাস্তবে এর ওপর আরেকটু জায়গা রাখা ভালো।`}
        </p>
      )}
      <div className="grid gap-2 text-sm sm:grid-cols-2">
        <p>
          <b>যা শিখলে: </b>
          {ch.lesson}
        </p>
        <p>
          <b>বাস্তবে: </b>
          {ch.realWorld}
        </p>
      </div>
      {allDone && !next && <p className="text-sm font-semibold">ছয়টা চ্যালেঞ্জই শেষ। এবার ফ্রি মোড আর ২৪ ঘণ্টা মোডে নিজের মতো করে ভেঙে দেখো।</p>}
    </div>
  );
}

export function Intro({ onClose, onChallenge }: { onClose: () => void; onChallenge: () => void }) {
  return (
    <div className="rounded-xl border border-accent bg-accent-soft p-4" data-testid="intro" role="region" aria-label="কীভাবে শুরু করবে">
      <div className="flex items-start justify-between gap-3">
        <h2 className="text-lg font-bold">কীভাবে শুরু করবে</h2>
        <button type="button" onClick={onClose} aria-label="গাইড বন্ধ করো" className="rounded-md px-2 text-lg leading-none text-muted hover:text-ink">
          ×
        </button>
      </div>
      <ol className="mt-2 grid gap-2 text-sm sm:grid-cols-3">
        <li>
          <b className="text-accent">১.</b> ট্রাফিক বাড়িয়ে দেখো কোন অংশ প্রথমে লাল হয়।
        </li>
        <li>
          <b className="text-accent">২.</b> সার্ভার, Load Balancer, Cache যোগ করো। কোনটা কী করে না বুঝলে পাশের “এটা কী?” চাপো।
        </li>
        <li>
          <b className="text-accent">৩.</b> চ্যালেঞ্জে বাজেটের মধ্যে সমাধান করো। যত কম খরচ, তত বেশি তারা।
        </li>
      </ol>
      <div className="mt-3 flex flex-wrap gap-2">
        <button type="button" onClick={onChallenge} className="rounded-lg bg-accent px-3 py-1.5 text-sm font-semibold text-panel">
          চ্যালেঞ্জ দিয়ে শুরু করো
        </button>
        <button type="button" onClick={onClose} className="rounded-lg border border-line bg-panel px-3 py-1.5 text-sm font-semibold">
          নিজে নিজে খেলি
        </button>
      </div>
    </div>
  );
}

/** মোবাইলে নিচে স্থির বার: নিয়ন্ত্রণ বদলালে ফল দেখতে উপরে স্ক্রল করতে হয় না */
export function MobileBar({ status, success, cost, budget, extra }: { status: SystemStatus; success: number; cost: number; budget?: number; extra?: string }) {
  const t = tone(status);
  const over = budget !== undefined && cost > budget;
  return (
    <div
      className="mobile-bar fixed inset-x-0 bottom-0 z-20 border-t border-line bg-panel lg:hidden"
      data-testid="mobile-bar"
      aria-live="polite"
    >
      <div className="gutter mx-auto flex items-center justify-between gap-3 py-2 text-sm">
        <span className={`flex min-w-0 items-center gap-2 font-bold ${t.fg}`}>
          <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${t.bar}`} aria-hidden />
          <span className="truncate">{STATUS_TEXT[status]}</span>
        </span>
        <span className="tnum flex shrink-0 items-center gap-3">
          {extra && <span className="text-muted">{extra}</span>}
          <span>
            সফল <b>{pct(success)}</b>
          </span>
          <span className={over ? "font-bold text-bad" : ""}>{taka(cost)}</span>
        </span>
      </div>
    </div>
  );
}
