"use client";

import type { Config, Health, SimResult } from "@/lib/model";
import type { DayConfig, DayResult } from "@/lib/timeline";
import { TICK_MINUTES } from "@/lib/timeline";
import { bn, clock, compact, pct } from "@/lib/format";
import { tone } from "./ui";

type Item = { tone: Health; text: string };

export function steadyInsights(r: SimResult, c: Pick<Config, "servers" | "loadBalancer" | "cache" | "replicas" | "writeShare">): Item[] {
  const out: Item[] = [];
  if (r.down) {
    const first = c.servers[0];
    if (!c.loadBalancer && (!first?.on || first?.crashed)) {
      out.push({
        tone: "bad",
        text: "সার্ভার ১ বন্ধ, আর Load Balancer না থাকায় ব্যবহারকারীরা অন্য কোনো সার্ভারের ঠিকানা জানে না। এই একটা সার্ভারই ছিল single point of failure।",
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
    out.push({ tone: "warn", text: `${bn(idle)}টা সার্ভার চালু থেকেও বসে আছে, অথচ তাদের খরচ দিতে হচ্ছে। Load Balancer ছাড়া তাদের কাছে কেউ পৌঁছায় না।` });
  }
  const full = r.servers.filter((s) => s.health === "full").length;
  if (full > 0 && red.length === 0) {
    out.push({ tone: "warn", text: `${bn(full)}টা সার্ভার ঠিক ১০০% লোডে। এখন সব রিকোয়েস্ট যাচ্ছে, কিন্তু আর একটু ট্রাফিক বাড়লেই ফেরত যাওয়া শুরু হবে।` });
  }
  if (r.dbHealth === "bad") {
    if (c.replicas > 0) {
      out.push({
        tone: "bad",
        text: "প্রধান ডাটাবেস লেখার (write) চাপেই ওভারলোড। Cache বা replica লেখা কমাতে পারে না। এই সিমুলেটরে এটাই শেষ সীমা; বাস্তবে লাগত sharding।",
      });
    } else {
      out.push({
        tone: "bad",
        text: c.cache
          ? `Cache থাকার পরও ডাটাবেস ওভারলোড, কারণ write (${pct(c.writeShare)}) আর Cache-এ না পাওয়া read সব এখানে আসছে। read-গুলো Read Replica-তে সরিয়ে দেখো।`
          : "ডাটাবেস ওভারলোড। সার্ভার বাড়ালে এটা মিটবে না, কারণ সব সার্ভার একই ডাটাবেসে যায়। Cache চালু করে দেখো।",
      });
    }
  } else if (r.dbHealth === "warn" || r.dbHealth === "full") {
    out.push({ tone: "warn", text: `প্রধান ডাটাবেস ${pct(r.dbUtil)} লোডে, সীমার কাছাকাছি।` });
  }
  if (r.replicaHealth === "bad") {
    out.push({ tone: "bad", text: "Read Replica-গুলো read সামলাতে পারছে না। আরেকটা replica যোগ করো, বা Cache চালু করো।" });
  }
  if (c.cache && r.cacheHits > 0) {
    out.push({
      tone: "ok",
      text: `Cache ${bn(Math.round(r.cacheHits))} req/s নিজেই সামলাচ্ছে, তাই ডাটাবেসে যাচ্ছে ${bn(Math.round(r.dbLoad + r.replicaLoad * c.replicas))}।`,
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

/** দিনের সবচেয়ে বড় সমস্যার সময়গুলো খুঁজে কারণসহ বলা */
export function dayInsights(day: DayResult, cfg: DayConfig): Item[] {
  const out: Item[] = [];
  type Win = { from: number; to: number; dropped: number; booting: boolean; atMax: boolean; db: boolean };
  const wins: Win[] = [];
  let cur: Win | null = null;
  for (const t of day.ticks) {
    const lost = t.traffic - t.result.successful;
    if (lost > 0.5) {
      if (!cur) cur = { from: t.minute, to: t.minute + TICK_MINUTES, dropped: 0, booting: false, atMax: false, db: false };
      cur.to = t.minute + TICK_MINUTES;
      cur.dropped += lost * TICK_MINUTES * 60;
      cur.booting ||= t.booting > 0;
      cur.atMax ||= cfg.autoscale.enabled && t.serving + t.booting >= cfg.autoscale.max;
      cur.db ||= t.result.dbDropped > 0.5;
    } else if (cur) {
      wins.push(cur);
      cur = null;
    }
  }
  if (cur) wins.push(cur);
  wins.sort((a, b) => b.dropped - a.dropped);

  for (const w of wins.slice(0, 2)) {
    const when = `${clock(w.from)} থেকে ${clock(w.to % 1440)}`;
    let why: string;
    if (w.db) why = "ডাটাবেস ভার সামলাতে পারেনি।";
    else if (!cfg.autoscale.enabled) why = "স্থায়ী সার্ভারগুলোর ক্ষমতা ভিড়ের চেয়ে কম ছিল।";
    else if (w.atMax) why = "autoscaler সর্বোচ্চ সীমায় পৌঁছে গিয়েছিল।";
    else if (w.booting) why = "নতুন সার্ভার চাওয়া হয়েছিল, কিন্তু চালু হতে ১০ মিনিট লাগে। ট্রাফিক হঠাৎ লাফ দিয়েছিল।";
    else why = "সার্ভারের ক্ষমতা কম পড়েছিল।";
    out.push({ tone: "bad", text: `${when}: প্রায় ${compact(w.dropped)} রিকোয়েস্ট ফেরত গেছে। কারণ: ${why}` });
  }
  if (wins.length > 2) out.push({ tone: "warn", text: `আরও ${bn(wins.length - 2)}টা ছোট সময়ে কিছু রিকোয়েস্ট ফেরত গেছে।` });

  if (cfg.autoscale.enabled) {
    const fixedCost = day.peakServers;
    out.push({
      tone: "ok",
      text: `Autoscaling-এ গড়ে ${bn(day.avgPaidServers, 1)}টা সার্ভার চলেছে। সারাদিন সর্বোচ্চ ${bn(fixedCost)}টা চালিয়ে রাখলে খরচ অনেক বেশি পড়ত।`,
    });
  } else if (wins.length === 0) {
    out.push({ tone: "warn", text: `সব রিকোয়েস্ট সফল, কিন্তু রাতেও ${bn(cfg.servers.length)}টা সার্ভার বসে বসে খরচ বাড়াচ্ছে। Autoscaling চালু করে দেখো।` });
  }
  if (wins.length === 0 && cfg.autoscale.enabled) out.unshift({ tone: "ok", text: "সারাদিনে একটা রিকোয়েস্টও ফেরত যায়নি।" });
  return out;
}

export default function Insights({ items }: { items: Item[] }) {
  return (
    <div className="rounded-xl border border-line bg-panel p-4" aria-live="polite" data-testid="insights">
      <p className="label mb-2 text-muted">কী ঘটছে</p>
      <ul className="flex flex-col gap-2">
        {items.map((it, i) => (
          <li key={i} className="flex gap-2.5">
            <span className={`mt-2 h-2 w-2 shrink-0 rounded-full ${tone(it.tone).bar}`} aria-hidden />
            <span className="min-w-0">{it.text}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
