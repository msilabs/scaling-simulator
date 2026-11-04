// হিসাবের unit test। চালাও: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import { COST, healthOf, makeServers, simulate, simulateOneMoreFailure, type Config } from "../src/lib/model";
import { CHALLENGES, contextFor, goalsMet, starsFor, type Challenge } from "../src/lib/challenges";
import { PATTERNS, TICKS, runDay, trafficAt, windowSuccess, type DayConfig } from "../src/lib/timeline";
import { bn, clock, pct, taka } from "../src/lib/format";

const base: Config = { traffic: 0, writeShare: 0.1, servers: makeServers(1), loadBalancer: false, cache: false, replicas: 0 };
const ch = (id: string) => CHALLENGES.find((c) => c.id === id) as Challenge;
const solved = (c: Challenge, config: unknown) => goalsMet(c, contextFor(c, config as Config)).every(Boolean);

test("লোডের রং: ৮০%-এর নিচে সবুজ, ঠিক ১০০% পূর্ণ, তার বেশি লাল", () => {
  assert.equal(healthOf(0.79), "ok");
  assert.equal(healthOf(0.8), "warn");
  assert.equal(healthOf(1), "full");
  assert.equal(healthOf(1.01), "bad");
});

test("ঠিক ১০০% লোডে কোনো রিকোয়েস্ট হারায় না এবং সার্ভার লাল নয়", () => {
  const r = simulate({ ...base, traffic: 200 });
  assert.equal(r.servers[0].health, "full");
  assert.equal(r.successRate, 1);
  assert.equal(r.anyServerRed, false);
});

test("Load Balancer ছাড়া বাড়তি সার্ভার কোনো কাজে আসে না", () => {
  const r = simulate({ ...base, traffic: 500, servers: makeServers(4) });
  assert.equal(r.servers[0].health, "bad");
  assert.ok(r.servers.slice(1).every((s) => s.unreachable));
  assert.equal(r.successful, 200);
});

test("Load Balancer ট্রাফিক সমান ভাগ করে", () => {
  const r = simulate({ ...base, traffic: 500, servers: makeServers(5), loadBalancer: true });
  assert.ok(r.servers.every((s) => Math.abs(s.load - 100) < 1e-9));
  assert.equal(r.status === "healthy" || r.status === "strained", true);
});

test("LB ছাড়া সার্ভার ১ বন্ধ হলে পুরো সিস্টেম বন্ধ; LB থাকলে চলে", () => {
  const servers = makeServers(3);
  servers[0].on = false;
  assert.equal(simulate({ ...base, traffic: 100, servers }).status, "down");
  assert.notEqual(simulate({ ...base, traffic: 100, servers, loadBalancer: true }).status, "down");
});

test("Cache শুধু read কমায়, write নয়", () => {
  const cfg = { ...base, traffic: 400, writeShare: 0.25, servers: makeServers(3), loadBalancer: true };
  const off = simulate(cfg);
  const on = simulate({ ...cfg, cache: true });
  assert.equal(off.dbLoad, 400);
  assert.equal(on.dbLoad, 100 + 300 * 0.2);
  assert.equal(on.writes, off.writes);
});

test("Replica থাকলে read সেখানে যায়, প্রধান ডাটাবেসে শুধু write", () => {
  const r = simulate({ ...base, traffic: 1000, writeShare: 0.2, servers: makeServers(5), loadBalancer: true, replicas: 2 });
  assert.equal(r.dbLoad, 200);
  assert.equal(r.replicaLoad, 400);
});

test("ডাটাবেস ওভারলোড হলে বাড়তি কোয়েরি ব্যর্থ হয়", () => {
  const r = simulate({ ...base, traffic: 1000, writeShare: 0, servers: makeServers(5), loadBalancer: true });
  assert.equal(r.dbDropped, 400);
  assert.ok(Math.abs(r.successRate - 0.6) < 1e-9);
});

test("খরচ: বন্ধ বা নষ্ট সার্ভারের খরচ নেই", () => {
  const servers = makeServers(3, true);
  servers[2].on = false;
  assert.equal(simulate({ ...base, servers, loadBalancer: true }).monthlyCost, COST.server + COST.loadBalancer + COST.database);
});

test("N+1: সবচেয়ে ব্যস্ত সার্ভার পড়ে গেলে কী হয়", () => {
  const cfg = { ...base, traffic: 450, servers: makeServers(3), loadBalancer: true };
  assert.ok(simulateOneMoreFailure(cfg).successRate < 0.99);
  assert.equal(simulateOneMoreFailure({ ...cfg, servers: makeServers(4) }).successRate, 1);
});

test("প্রতিটা চ্যালেঞ্জ শুরুতে অসমাধিত", () => {
  for (const c of CHALLENGES) assert.equal(solved(c, c.start), false, c.id);
});

test("সব কিছু সর্বোচ্চ চালু করলে বাজেট ছাড়িয়ে যায় (জোর খাটিয়ে সমাধান হয় না)", () => {
  for (const c of CHALLENGES.filter((x) => x.kind === "steady")) {
    const max = { ...c.start, servers: makeServers(12, c.id === "crash"), loadBalancer: true, cache: true, replicas: 3 };
    const ctx = contextFor(c, max);
    assert.ok(ctx.cost > c.budget, `${c.id}: ${ctx.cost}`);
  }
});

test("চ্যালেঞ্জ ১: LB + ৩ সার্ভার, ৩ তারা", () => {
  const c = ch("first-rush");
  const s = { ...c.start, loadBalancer: true, servers: makeServers(3) };
  assert.ok(solved(c, s));
  assert.equal(starsFor(c, contextFor(c, s).cost), 3);
  assert.equal(solved(c, { ...s, servers: makeServers(2) }), false);
});

test("চ্যালেঞ্জ ২: Cache দিলে সমাধান; একটা সার্ভার কমালে ৩ তারা", () => {
  const c = ch("db-gasping");
  const s = { ...c.start, cache: true };
  assert.ok(solved(c, s));
  const lean = { ...s, servers: makeServers(5) };
  assert.ok(solved(c, lean));
  assert.equal(starsFor(c, contextFor(c, lean).cost), 3);
});

test("চ্যালেঞ্জ ৩: LB + ৪টা চালু সার্ভার লাগে", () => {
  const c = ch("crash");
  assert.equal(solved(c, { ...c.start, loadBalancer: true, servers: makeServers(4, true) }), false);
  const s = { ...c.start, loadBalancer: true, servers: makeServers(5, true) };
  assert.ok(solved(c, s));
  assert.equal(starsFor(c, contextFor(c, s).cost), 3);
});

test("চ্যালেঞ্জ ৪: সার্ভার বাড়িয়ে হয় না, replica লাগে", () => {
  const c = ch("write-storm");
  assert.equal(solved(c, { ...c.start, servers: makeServers(12) }), false);
  const s = { ...c.start, replicas: 1 };
  assert.ok(solved(c, s));
  assert.ok(starsFor(c, contextFor(c, s).cost) >= 2);
  assert.equal(starsFor(c, contextFor(c, { ...s, servers: makeServers(8) }).cost), 3);
});

test("চ্যালেঞ্জ ৫: শুধু autoscaling যথেষ্ট না; ৭টা থেকে প্রস্তুতি নিলে সফল, ৮টা থেকে দেরি", () => {
  const c = ch("flash-sale");
  if (c.kind !== "day") throw new Error();
  const auto = { ...c.start, autoscale: { ...c.start.autoscale, enabled: true } };
  assert.equal(solved(c, auto), false);
  assert.equal(solved(c, { ...c.start, servers: makeServers(11) }), false, "১১টা স্থায়ী সার্ভার বাজেটের বাইরে");
  const late = { ...auto, prewarm: { enabled: true, from: 20, to: 22, min: 11 } };
  assert.equal(solved(c, late), false);
  const good = { ...auto, prewarm: { enabled: true, from: 19, to: 22, min: 11 } };
  assert.ok(solved(c, good));
  assert.equal(starsFor(c, contextFor(c, good).cost), 3);
});

test("চ্যালেঞ্জ ৬: লক্ষ্য লোড ৫০% করলে সফল", () => {
  const c = ch("viral");
  if (c.kind !== "day") throw new Error();
  const s = { ...c.start, autoscale: { ...c.start.autoscale, target: 0.5 } };
  assert.ok(solved(c, s));
  assert.equal(starsFor(c, contextFor(c, s).cost), 3);
  assert.equal(solved(c, { ...c.start, autoscale: { ...c.start.autoscale, target: 0.6 } }), false);
});

test("টাইমলাইন: ১৪৪ ধাপ, ফ্ল্যাশ সেলে রাত ৮টায় লাফ", () => {
  assert.equal(TICKS, 144);
  assert.ok(trafficAt("flash", 1200) > 2 * trafficAt("flash", 1190));
  assert.equal(PATTERNS.normal.points.length, 25);
});

test("টাইমলাইন: নতুন সার্ভার এক ধাপ চালু হতে থাকে, তারপর ট্রাফিক নেয়", () => {
  const day: DayConfig = {
    ...base,
    loadBalancer: true,
    cache: true,
    pattern: "flash",
    autoscale: { enabled: true, min: 2, max: 12, target: 0.7 },
    prewarm: { enabled: false, from: 19, to: 22, min: 10 },
  };
  const r = runDay(day);
  const t120 = r.ticks[120];
  const t121 = r.ticks[121];
  const t122 = r.ticks[122];
  assert.ok(t120.result.successRate < 0.99, "লাফের মুহূর্তে ভিড় সামলাতে পারে না");
  assert.ok(t121.booting > 0, "পরের ধাপে নতুন সার্ভার চালু হচ্ছে");
  assert.ok(t122.serving > t120.serving, "তার পরের ধাপে কাজ শুরু করেছে");
  assert.ok(windowSuccess(r, 1200, 1320) < 0.99);
});

test("ফরম্যাট: বাংলা অঙ্ক, টাকা, সময়", () => {
  assert.equal(bn(2026), "২০২৬");
  assert.equal(pct(0.995), "৯৯.৫%");
  assert.equal(pct(0.9999), "৯৯.৯%");
  assert.equal(taka(125000), "৳১,২৫,০০০");
  assert.equal(taka(4000), "৳৪,০০০");
  assert.equal(clock(20 * 60 + 10), "রাত ৮:১০");
});
