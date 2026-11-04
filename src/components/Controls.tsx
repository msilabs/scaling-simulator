"use client";

import { useState } from "react";
import { COST, MAX_REPLICAS, MAX_SERVERS, MAX_TRAFFIC, SERVER_CAPACITY, type Config } from "@/lib/model";
import { PATTERNS, type DayConfig, type PatternId } from "@/lib/timeline";
import { bn, hourLabel, pct } from "@/lib/format";
import { Chips, CostTag, Info, Stepper, Toggle } from "./ui";
import { EXPLAIN } from "./explain";

export const TRAFFIC_PRESETS: { label: string; value: number }[] = [
  { label: "গভীর রাত", value: 40 },
  { label: "সাধারণ দুপুর", value: 300 },
  { label: "ভাইরাল পোস্ট", value: 1200 },
  { label: "ঈদের সেল", value: 2400 },
];

type Shared = Pick<Config, "writeShare" | "servers" | "loadBalancer" | "cache" | "replicas">;

/** দুই মোডেই একই অংশ: Load Balancer, Cache, Replica, write-এর ভাগ */
function Infrastructure<T extends Shared>({
  config,
  set,
  lockWrites,
}: {
  config: T;
  set: (fn: (c: T) => T) => void;
  lockWrites: boolean;
}) {
  return (
    <>
      <Toggle
        id="toggle-lb"
        label="Load Balancer"
        desc="ট্রাফিক সব চালু সার্ভারে সমান ভাগ করে, নষ্ট সার্ভার বাদ দেয়।"
        cost={COST.loadBalancer}
        checked={config.loadBalancer}
        onChange={(v) => set((c) => ({ ...c, loadBalancer: v }))}
        info={<Info title="Load Balancer">{EXPLAIN.loadBalancer}</Info>}
      />
      <Toggle
        id="toggle-cache"
        label="Cache"
        desc="বারবার চাওয়া ডেটা মেমোরিতে রাখে; read-এর ৮০% ডাটাবেসে যায় না।"
        cost={COST.cache}
        checked={config.cache}
        onChange={(v) => set((c) => ({ ...c, cache: v }))}
        info={<Info title="Cache">{EXPLAIN.cache}</Info>}
      />
      <Stepper
        id="replicas"
        label="Read Replica"
        value={config.replicas}
        min={0}
        max={MAX_REPLICAS}
        onChange={(v) => set((c) => ({ ...c, replicas: v }))}
        desc={
          <>
            ডাটাবেসের কপি, শুধু read নেয়। <CostTag amount={COST.replica} />
          </>
        }
        info={<Info title="Read Replica">{EXPLAIN.replica}</Info>}
      />
      <div>
        <div className="flex items-baseline justify-between gap-2">
          <span>
            <label htmlFor="write-share" className="font-semibold">
              লেখার (write) ভাগ
            </label>
            <Info title="লেখার ভাগ">{EXPLAIN.writeShare}</Info>
          </span>
          <span className="tnum font-bold" data-testid="write-share-value">
            {pct(config.writeShare)}
          </span>
        </div>
        {lockWrites ? (
          <p className="text-sm text-muted">এই চ্যালেঞ্জে নির্দিষ্ট।</p>
        ) : (
          <input
            id="write-share"
            type="range"
            min={0}
            max={50}
            step={5}
            value={Math.round(config.writeShare * 100)}
            onChange={(e) => {
              const v = Number(e.target.value) / 100;
              set((c) => ({ ...c, writeShare: v }));
            }}
            className="mt-2 w-full"
          />
        )}
      </div>
    </>
  );
}

function ResetButton({ label, onReset }: { label: string; onReset: () => void }) {
  return (
    <button type="button" onClick={onReset} className="self-start rounded-lg border border-line px-3 py-1.5 text-sm font-semibold hover:border-accent">
      {label}
    </button>
  );
}

export function SteadyControls({
  config,
  setConfig,
  locked,
  onReset,
}: {
  config: Config;
  setConfig: (fn: (c: Config) => Config) => void;
  locked: boolean;
  onReset: () => void;
}) {
  const count = config.servers.length;
  return (
    <div className="flex flex-col gap-5 rounded-xl border border-line bg-panel p-4" data-testid="controls">
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
          <div className="mt-2">
            <Chips
              label="তৈরি ট্রাফিক"
              value={config.traffic}
              onChange={(v) => setConfig((c) => ({ ...c, traffic: v }))}
              options={TRAFFIC_PRESETS.map((p) => ({ value: p.value, label: `${p.label} ${bn(p.value)}` }))}
            />
          </div>
        )}
      </div>

      <Stepper
        id="servers"
        label="অ্যাপ সার্ভার"
        value={count}
        min={1}
        max={MAX_SERVERS}
        minDisabled={!!config.servers[count - 1]?.crashed}
        onChange={(v) =>
          setConfig((c) => ({
            ...c,
            servers: v > c.servers.length ? [...c.servers, { on: true }] : c.servers.slice(0, v),
          }))
        }
        desc={
          <>
            প্রতিটা {bn(SERVER_CAPACITY)} req/s সামলায়। <CostTag amount={COST.server} />
          </>
        }
        info={<Info title="অ্যাপ সার্ভার">{EXPLAIN.server}</Info>}
      />

      <Infrastructure config={config} set={setConfig} lockWrites={locked} />

      <ResetButton label={locked ? "চ্যালেঞ্জ আবার শুরু" : "শুরুর অবস্থায় ফেরো"} onReset={onReset} />
    </div>
  );
}

const TARGETS = [0.5, 0.6, 0.7, 0.8];
const HOURS = Array.from({ length: 24 }, (_, h) => h);

export function DayControls({
  config,
  setConfig,
  locked,
  onReset,
}: {
  config: DayConfig;
  setConfig: (fn: (c: DayConfig) => DayConfig) => void;
  locked: boolean;
  onReset: () => void;
}) {
  const a = config.autoscale;
  const p = config.prewarm;
  const setAuto = (patch: Partial<DayConfig["autoscale"]>) =>
    setConfig((c) => {
      const next = { ...c.autoscale, ...patch };
      if (next.min > next.max) next.max = next.min;
      return { ...c, autoscale: next };
    });
  const setPre = (patch: Partial<DayConfig["prewarm"]>) =>
    setConfig((c) => {
      const next = { ...c.prewarm, ...patch };
      if (next.to <= next.from) next.to = Math.min(24, next.from + 1);
      return { ...c, prewarm: next };
    });

  return (
    <div className="flex flex-col gap-5 rounded-xl border border-line bg-panel p-4" data-testid="controls">
      <div>
        <p className="font-semibold">দিনের ধরন</p>
        {locked ? (
          <p className="text-sm text-muted">{PATTERNS[config.pattern].desc}</p>
        ) : (
          <>
            <div className="mt-1.5">
              <Chips<PatternId>
                label="দিনের ধরন"
                testId="pattern"
                value={config.pattern}
                onChange={(v) => setConfig((c) => ({ ...c, pattern: v }))}
                options={(Object.keys(PATTERNS) as PatternId[]).map((k) => ({ value: k, label: PATTERNS[k].label }))}
              />
            </div>
            <p className="mt-1.5 text-sm text-muted">{PATTERNS[config.pattern].desc}</p>
          </>
        )}
      </div>

      <Toggle
        id="toggle-autoscale"
        label="Autoscaling"
        desc="ট্রাফিক দেখে নিজে থেকে সার্ভার বাড়ায়-কমায়। নতুন সার্ভার চালু হতে ১০ মিনিট লাগে।"
        checked={a.enabled}
        onChange={(v) => setAuto({ enabled: v })}
        info={<Info title="Autoscaling">{EXPLAIN.autoscaling}</Info>}
      />

      {a.enabled ? (
        <div className="flex flex-col gap-4 border-l-2 border-line pl-3">
          <Stepper id="auto-min" label="সবসময় অন্তত" value={a.min} min={1} max={MAX_SERVERS} onChange={(v) => setAuto({ min: v })} desc="টা সার্ভার চালু থাকবে" />
          <Stepper id="auto-max" label="সর্বোচ্চ" value={a.max} min={Math.max(1, a.min)} max={MAX_SERVERS} onChange={(v) => setAuto({ max: v })} desc="টা পর্যন্ত বাড়াতে পারবে" />
          <div>
            <p className="font-semibold">
              লক্ষ্য লোড
              <Info title="লক্ষ্য লোড">{EXPLAIN.target}</Info>
            </p>
            <p className="mb-1.5 text-sm text-muted">প্রতিটা সার্ভারের লোড এর বেশি হলে নতুন সার্ভার চায়।</p>
            <Chips<number>
              label="লক্ষ্য লোড"
              testId="target"
              value={a.target}
              onChange={(v) => setAuto({ target: v })}
              options={TARGETS.map((t) => ({ value: t, label: pct(t) }))}
            />
          </div>

          <Toggle
            id="toggle-prewarm"
            label="আগাম প্রস্তুতি"
            desc="নির্দিষ্ট সময়ে ন্যূনতম সার্ভার বাড়িয়ে রাখে, জানা ভিড়ের জন্য।"
            checked={p.enabled}
            onChange={(v) => setPre({ enabled: v })}
            info={<Info title="আগাম প্রস্তুতি">{EXPLAIN.prewarm}</Info>}
          />
          {p.enabled && (
            <div className="flex flex-col gap-3">
              <div className="grid grid-cols-2 gap-2">
                <label className="text-sm">
                  <span className="mb-1 block text-muted">শুরু</span>
                  <select
                    id="prewarm-from"
                    data-testid="prewarm-from"
                    value={p.from}
                    onChange={(e) => setPre({ from: Number(e.target.value) })}
                    className="w-full rounded-lg border border-line bg-panel px-2 py-1.5"
                  >
                    {HOURS.map((h) => (
                      <option key={h} value={h}>
                        {hourLabel(h)}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="text-sm">
                  <span className="mb-1 block text-muted">শেষ</span>
                  <select
                    id="prewarm-to"
                    data-testid="prewarm-to"
                    value={p.to}
                    onChange={(e) => setPre({ to: Number(e.target.value) })}
                    className="w-full rounded-lg border border-line bg-panel px-2 py-1.5"
                  >
                    {HOURS.map((h) => h + 1).filter((h) => h > p.from).map((h) => (
                      <option key={h} value={h}>
                        {h === 24 ? "রাত ১২টা" : hourLabel(h)}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <Stepper id="prewarm-min" label="ওই সময়ে অন্তত" value={p.min} min={1} max={MAX_SERVERS} onChange={(v) => setPre({ min: v })} desc="টা সার্ভার" />
            </div>
          )}
        </div>
      ) : (
        <Stepper
          id="servers"
          label="স্থায়ী সার্ভার"
          value={config.servers.length}
          min={1}
          max={MAX_SERVERS}
          onChange={(v) => setConfig((c) => ({ ...c, servers: Array.from({ length: v }, () => ({ on: true })) }))}
          desc={
            <>
              সারাদিন চালু থাকে। <CostTag amount={COST.server} />
            </>
          }
          info={<Info title="সার্ভার">{EXPLAIN.server}</Info>}
        />
      )}

      <Infrastructure config={config} set={setConfig} lockWrites={locked} />

      <ResetButton label={locked ? "চ্যালেঞ্জ আবার শুরু" : "শুরুর অবস্থায় ফেরো"} onReset={onReset} />
    </div>
  );
}

/** ভুল করে চাপ লাগলে সব না মুছে যায়, তাই দুই ধাপ */
export function ForgetAll({ onConfirm }: { onConfirm: () => void }) {
  const [asking, setAsking] = useState(false);
  if (!asking)
    return (
      <button type="button" onClick={() => setAsking(true)} className="justify-self-start text-sm text-muted underline underline-offset-2 hover:text-ink lg:self-start">
        সব অগ্রগতি মুছে নতুন করে শুরু
      </button>
    );
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg border border-bad bg-bad-soft px-3 py-2 text-sm" role="alert">
      <span>সব চ্যালেঞ্জের তারা আর সেটিং মুছে যাবে।</span>
      <button
        type="button"
        onClick={() => {
          setAsking(false);
          onConfirm();
        }}
        className="rounded-md bg-bad px-2.5 py-1 font-semibold text-panel"
      >
        হ্যাঁ, মুছে দাও
      </button>
      <button type="button" onClick={() => setAsking(false)} className="rounded-md border border-line bg-panel px-2.5 py-1 font-semibold">
        না, থাক
      </button>
    </div>
  );
}
