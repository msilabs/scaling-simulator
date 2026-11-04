// ছয়টা চ্যালেঞ্জ: প্রতিটা একটা করে system design ধারণা শেখায়।
// প্রতিটায় বাজেট আছে, তাই "সব চালু করে দাও" দিয়ে সমাধান হয় না।

import { makeServers, simulate, simulateOneMoreFailure, type Config, type SimResult } from "./model";
import { runDay, windowSuccess, type DayConfig, type DayResult } from "./timeline";

export type Ctx =
  | { kind: "steady"; config: Config; result: SimResult; cost: number }
  | { kind: "day"; config: DayConfig; day: DayResult; cost: number };

export type Goal = { id: string; label: string; check: (ctx: Ctx) => boolean };

type Base = {
  id: string;
  title: string;
  concept: string;
  story: string;
  hint: string;
  lesson: string;
  realWorld: string;
  budget: number;
  /** সবচেয়ে কম খরচের জানা সমাধান; এর মধ্যে থাকলে ৩ তারা */
  par: number;
  goals: Goal[];
};

export type Challenge =
  | (Base & { kind: "steady"; start: Config })
  | (Base & { kind: "day"; start: DayConfig });

const steadyResult = (ctx: Ctx) => (ctx.kind === "steady" ? ctx.result : null);

const goalSuccess: Goal = {
  id: "success",
  label: "৯৯% বা তার বেশি রিকোয়েস্ট সফল",
  check: (ctx) => (steadyResult(ctx)?.successRate ?? 0) >= 0.99,
};
const goalNoRed: Goal = {
  id: "no-red",
  label: "কোনো সার্ভার ওভারলোড (লাল) নয়",
  check: (ctx) => ctx.kind === "steady" && !ctx.result.anyServerRed,
};
const goalBudget = (budget: number): Goal => ({
  id: "budget",
  label: "মাসিক খরচ বাজেটের মধ্যে",
  check: (ctx) => ctx.cost <= budget,
});

const DEFAULT_AUTOSCALE = { enabled: false, min: 2, max: 12, target: 0.7 };
const DEFAULT_PREWARM = { enabled: false, from: 19, to: 22, min: 10 };

export const CHALLENGES: Challenge[] = [
  {
    kind: "steady",
    id: "first-rush",
    title: "প্রথম ভিড়",
    concept: "Load Balancer",
    story: "নতুন রেসিপি অ্যাপটা ফেসবুকে ছড়িয়ে পড়েছে। সেকেন্ডে ৫০০ রিকোয়েস্ট আসছে, অথচ একটা সার্ভার সামলাতে পারে মাত্র ২০০।",
    hint: "শুধু সার্ভার বাড়ালে হবে না। ব্যবহারকারীরা এখনো শুধু সার্ভার ১-এর ঠিকানা জানে। ট্রাফিক ভাগ করে দেবে কে? আর সব কিছু চালু করলে বাজেটে কুলাবে না।",
    lesson: "Horizontal scaling কাজ করে তখনই, যখন Load Balancer ট্রাফিক সব সার্ভারে ভাগ করে দেয়।",
    realWorld: "বাস্তবে AWS ALB, Nginx বা Cloudflare-এর মতো Load Balancer এই কাজ করে। ব্যবহারকারী একটাই ঠিকানা দেখে, পেছনে শত শত সার্ভার থাকতে পারে।",
    budget: 30000,
    par: 22500,
    start: { traffic: 500, writeShare: 0.1, servers: makeServers(1), loadBalancer: false, cache: false, replicas: 0 },
    goals: [goalSuccess, goalNoRed, goalBudget(30000)],
  },
  {
    kind: "steady",
    id: "db-gasping",
    title: "ডাটাবেস হাঁপাচ্ছে",
    concept: "Cache",
    story: "সার্ভার এখন যথেষ্ট, কিন্তু সেকেন্ডে ৯০০ রিকোয়েস্টের প্রতিটাই ডাটাবেসে যাচ্ছে। ডাটাবেস নিতে পারে ৬০০।",
    hint: "বেশিরভাগ ব্যবহারকারী একই জনপ্রিয় রেসিপি দেখছে। একই উত্তর বারবার ডাটাবেস থেকে না এনে কোথায় রাখা যায়? আর সার্ভার কি একটা বেশি আছে?",
    lesson: "বারবার পড়া ডেটা Cache-এ রাখলে ডাটাবেসের লোড অনেক কমে, গতিও বাড়ে। সার্ভার বাড়িয়ে ডাটাবেসের সমস্যা মেটে না।",
    realWorld: "Redis আর Memcached সবচেয়ে প্রচলিত Cache। ফেসবুক, টুইটারের মতো সাইটে বেশিরভাগ read ডাটাবেসে পৌঁছায়ই না।",
    budget: 40000,
    par: 33500,
    start: { traffic: 900, writeShare: 0.1, servers: makeServers(6), loadBalancer: true, cache: false, replicas: 0 },
    goals: [
      goalSuccess,
      goalNoRed,
      { id: "db-70", label: "ডাটাবেস লোড ৭০%-এর নিচে", check: (ctx) => ctx.kind === "steady" && ctx.result.dataUtil < 0.7 },
      goalBudget(40000),
    ],
  },
  {
    kind: "steady",
    id: "crash",
    title: "সার্ভার ক্র্যাশ",
    concept: "Redundancy (N+1)",
    story: "রাত ২টায় সার্ভার ১-এর হার্ডডিস্ক নষ্ট হয়ে গেছে। সেকেন্ডে ৪৫০ রিকোয়েস্ট আসছে, আর সবাই সার্ভার ১-কেই খুঁজছে।",
    hint: "আগে ট্রাফিক বাকি সার্ভারগুলোর দিকে ঘোরাও। তারপর ভাবো, আরেকটা সার্ভার পড়ে গেলেও কি টিকে থাকবে?",
    lesson: "Load Balancer নষ্ট সার্ভার বাদ দিয়ে বাকিগুলোতে ট্রাফিক পাঠায়। একটা বাড়তি সার্ভার (N+1) রাখলে আরেকটা নষ্ট হলেও সেবা চলে।",
    realWorld: "Load Balancer প্রতি কয়েক সেকেন্ডে প্রতিটা সার্ভারকে health check করে। বড় কোম্পানিগুলো আলাদা ডেটা সেন্টারেও (availability zone) সার্ভার ছড়িয়ে রাখে, যাতে পুরো একটা ভবন বন্ধ হলেও সেবা চলে।",
    budget: 30000,
    par: 26500,
    start: { traffic: 450, writeShare: 0.1, servers: makeServers(3, true), loadBalancer: false, cache: false, replicas: 0 },
    goals: [
      { id: "up", label: "সিস্টেম চালু আছে", check: (ctx) => ctx.kind === "steady" && !ctx.result.down },
      goalSuccess,
      goalNoRed,
      {
        id: "n-plus-1",
        label: "আরেকটা সার্ভার পড়ে গেলেও ৯৯% সফল",
        check: (ctx) => ctx.kind === "steady" && simulateOneMoreFailure(ctx.config).successRate >= 0.99,
      },
      goalBudget(30000),
    ],
  },
  {
    kind: "steady",
    id: "write-storm",
    title: "Cache-ও যথেষ্ট না",
    concept: "Read Replica",
    story: "অ্যাপে এখন সবাই রেসিপিতে রিভিউ লিখছে। সেকেন্ডে ১৬০০ রিকোয়েস্টের ২৫% ডেটা লেখে। Cache চালু থাকার পরও ডাটাবেস সামলাতে পারছে না।",
    hint: "Cache শুধু পড়ার (read) চাপ কমায়, লেখা (write) সবসময় প্রধান ডাটাবেসেই যায়। পড়ার বাকি কাজটা কি অন্য কোথাও পাঠানো যায়?",
    lesson: "Read Replica হলো ডাটাবেসের কপি, যা শুধু পড়ার কাজ নেয়। তাতে প্রধান ডাটাবেস শুধু লেখার কাজে মন দিতে পারে।",
    realWorld: "MySQL, PostgreSQL সবাই replica সমর্থন করে। তবে replica-তে নতুন লেখা পৌঁছাতে কিছু মিলিসেকেন্ড দেরি হয় (replication lag), তাই সদ্য লেখা রিভিউ এক মুহূর্ত পরে দেখা যেতে পারে। লেখাও যদি এক ডাটাবেসের সীমা ছাড়ায়, তখন লাগে sharding: ডেটা ভাগ করে কয়েকটা ডাটাবেসে রাখা।",
    budget: 60000,
    par: 51500,
    start: { traffic: 1600, writeShare: 0.25, servers: makeServers(9), loadBalancer: true, cache: true, replicas: 0 },
    goals: [goalSuccess, goalNoRed, goalBudget(60000)],
  },
  {
    kind: "day",
    id: "flash-sale",
    title: "ফ্ল্যাশ সেল",
    concept: "Autoscaling ও আগাম প্রস্তুতি",
    story: "রাত ৮টায় বড় সেল। ট্রাফিক এক মিনিটে তিনগুণ হবে। সারাদিন ১১টা সার্ভার চালালে সামলানো যায়, কিন্তু খরচ বাজেটের অনেক বেশি।",
    hint: "Autoscaling চালু করো, তারপর ২৪ ঘণ্টা চালিয়ে দেখো রাত ৮টায় কী হয়। নতুন সার্ভার চালু হতে ১০ মিনিট লাগে। যে ভিড় আগে থেকে জানা, তার জন্য কখন প্রস্তুতি নেওয়া উচিত?",
    lesson: "Autoscaling ধীরে বাড়া ট্রাফিক ভালো সামলায়, কিন্তু হঠাৎ লাফ দিলে দেরি হয়ে যায়। জানা ভিড়ের আগে সার্ভার বাড়িয়ে রাখলে (scheduled scaling) সস্তাতেও নিরাপদ থাকা যায়।",
    realWorld: "দারাজ, অ্যামাজনের মতো সাইট বড় সেলের ঘণ্টাখানেক আগে থেকে সার্ভার বাড়িয়ে রাখে, আর আগে load test করে দেখে নেয়। AWS, Google Cloud-এ এর নাম scheduled scaling।",
    budget: 40000,
    par: 31500,
    start: {
      writeShare: 0.05,
      servers: makeServers(4),
      loadBalancer: true,
      cache: true,
      replicas: 0,
      pattern: "flash",
      autoscale: { ...DEFAULT_AUTOSCALE },
      prewarm: { ...DEFAULT_PREWARM },
    },
    goals: [
      {
        id: "sale",
        label: "সেলের সময় (রাত ৮–১০টা) ৯৯% সফল",
        check: (ctx) => ctx.kind === "day" && windowSuccess(ctx.day, 20 * 60, 22 * 60) >= 0.99,
      },
      { id: "day", label: "পুরো দিনে ৯৯.৫% সফল", check: (ctx) => ctx.kind === "day" && ctx.day.successRate >= 0.995 },
      goalBudget(40000),
    ],
  },
  {
    kind: "day",
    id: "viral",
    title: "অজানা ঝড়",
    concept: "Headroom",
    story: "দুপুর ২টায় একজন বড় ইউটিউবার তোমার অ্যাপের কথা বলবে, কিন্তু তুমি তা জানো না। আধা ঘণ্টায় ট্রাফিক তিনগুণ হবে।",
    hint: "এবার আগে থেকে সময় জানা নেই, তাই আগাম প্রস্তুতি কাজে আসবে না। Autoscaler কখন নতুন সার্ভার চায়, সেটা বদলে দেখো।",
    lesson: "লক্ষ্য লোড কম রাখলে (যেমন ৫০–৬০%) প্রতিটা সার্ভারে বাড়তি জায়গা (headroom) থাকে। নতুন সার্ভার আসার আগ পর্যন্ত সেই জায়গা দিয়েই হঠাৎ ভিড় সামলানো যায়। বিনিময়ে খরচ একটু বেশি।",
    realWorld: "বেশিরভাগ কোম্পানি CPU ৫০–৭০%-এ autoscaling-এর লক্ষ্য রাখে। কত কম রাখবে, সেটা খরচ আর ঝুঁকির মধ্যে একটা সিদ্ধান্ত।",
    budget: 38000,
    par: 35500,
    start: {
      writeShare: 0.05,
      servers: makeServers(4),
      loadBalancer: true,
      cache: true,
      replicas: 0,
      pattern: "viral",
      autoscale: { ...DEFAULT_AUTOSCALE, enabled: true, target: 0.8 },
      prewarm: { ...DEFAULT_PREWARM },
    },
    goals: [
      { id: "day", label: "পুরো দিনে ৯৯.৯% সফল", check: (ctx) => ctx.kind === "day" && ctx.day.successRate >= 0.999 },
      goalBudget(38000),
    ],
  },
];

export function contextFor(ch: Challenge, config: Config | DayConfig): Ctx {
  if (ch.kind === "steady") {
    const c = config as Config;
    const result = simulate(c);
    return { kind: "steady", config: c, result, cost: result.monthlyCost };
  }
  const d = config as DayConfig;
  const day = runDay(d);
  return { kind: "day", config: d, day, cost: day.monthlyCost };
}

export function goalsMet(ch: Challenge, ctx: Ctx): boolean[] {
  return ch.goals.map((g) => g.check(ctx));
}

/** ১–৩ তারা: বাজেটের মধ্যে সমাধান হলে অন্তত ১, জানা সেরা খরচের কাছে থাকলে বেশি */
export function starsFor(ch: Challenge, cost: number): 1 | 2 | 3 {
  if (cost <= ch.par) return 3;
  if (cost <= ch.par + 4000) return 2;
  return 1;
}
