// ব্রাউজারে অ্যাপ চালিয়ে মূল আচরণগুলো যাচাই করে।
// ব্যবহার: node scripts/smoke-test.mjs <url> [screenshot-dir]
// উদাহরণ: node scripts/smoke-test.mjs http://localhost:3000 shots
//          node scripts/smoke-test.mjs file://$PWD/dist-artifact/index.html
import { createRequire } from "node:module";
// পরিবেশে আগে থেকে ইনস্টল করা Playwright (CommonJS require দিয়ে খোঁজে)
const { chromium } = createRequire(import.meta.url)("playwright");
import { mkdirSync } from "node:fs";

const url = process.argv[2] || "http://localhost:3000";
const shotDir = process.argv[3];
if (shotDir) mkdirSync(shotDir, { recursive: true });

const results = [];
const check = (name, ok, detail = "") => {
  results.push({ name, ok });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  — " + detail : ""}`);
};

const browser = await chromium.launch();
const errors = [];

async function newPage(viewport) {
  const ctx = await browser.newContext({ viewport });
  const page = await ctx.newPage();
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(`${viewport.width}px: ${m.text()}`);
  });
  page.on("pageerror", (e) => errors.push(`${viewport.width}px pageerror: ${e.message}`));
  await page.goto(url, { waitUntil: "networkidle" });
  await page.evaluate(() => {
    try {
      localStorage.clear();
    } catch {}
  });
  await page.reload({ waitUntil: "networkidle" });
  await page.getByTestId("diagram").waitFor();
  return page;
}

const health = (page, id) => page.getByTestId(id).getAttribute("data-health");
const setRange = (page, value) =>
  page.getByTestId("traffic").evaluate((el, v) => {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set;
    setter.call(el, String(v));
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
  }, value);

// ---------- ডেস্কটপ ----------
const page = await newPage({ width: 1280, height: 900 });
if (shotDir) await page.waitForTimeout(600), await page.screenshot({ path: `${shotDir}/desktop-start.png`, fullPage: true });

// ১. ফ্রি মোড: ট্রাফিক বাড়ালে লাল, সার্ভার + LB দিলে সবুজ
await setRange(page, 500);
check("ট্রাফিক ৫০০-তে সার্ভার ১ লাল", (await health(page, "server-1")) === "bad");
for (let i = 0; i < 4; i++) await page.getByTestId("add-server").click();
check("LB ছাড়া সার্ভার যোগ করলেও সার্ভার ১ লাল থাকে", (await health(page, "server-1")) === "bad");
await page.getByTestId("toggle-lb").check({ force: true });
const allGreen = await Promise.all([1, 2, 3, 4, 5].map((i) => health(page, `server-${i}`)));
check("৫ সার্ভার + LB দিলে সব সবুজ", allGreen.every((h) => h === "ok"), allGreen.join(","));
if (shotDir) await page.waitForTimeout(600), await page.screenshot({ path: `${shotDir}/desktop-scaled.png`, fullPage: true });

// ২. Cache চালু করলে DB লোড কমে
const dbBefore = Number(await page.getByTestId("db-node").getAttribute("data-util"));
await page.getByTestId("toggle-cache").check({ force: true });
const dbAfter = Number(await page.getByTestId("db-node").getAttribute("data-util"));
check("Cache চালু করলে ডাটাবেস লোড কমে", dbAfter < dbBefore, `${dbBefore} → ${dbAfter}`);

// ৩. LB ছাড়া সার্ভার বন্ধ করলে পুরো সিস্টেম বন্ধ
await page.getByTestId("toggle-lb").uncheck({ force: true });
await page.getByTestId("server-1").click();
const st = await page.getByTestId("system-status").getAttribute("data-status");
check("LB ছাড়া সার্ভার ১ বন্ধ করলে সিস্টেম বন্ধ", st === "down", st);
const stText = await page.getByTestId("system-status").innerText();
check("‘পুরো সিস্টেম বন্ধ’ লেখা দেখায়", stText.includes("পুরো সিস্টেম বন্ধ"), stText);
if (shotDir) await page.waitForTimeout(600), await page.screenshot({ path: `${shotDir}/desktop-down.png`, fullPage: true });
await page.getByTestId("toggle-lb").check({ force: true });
const st2 = await page.getByTestId("system-status").getAttribute("data-status");
check("LB চালু করলে বাকি সার্ভার দিয়ে সিস্টেম আবার চালু", st2 !== "down", st2);

// ৪. তিনটা চ্যালেঞ্জ
await page.getByTestId("tab-challenge").click();
const banner = page.getByTestId("success-banner");
check("চ্যালেঞ্জ ১ শুরুতে অসমাধিত", (await banner.count()) === 0);
// চ্যালেঞ্জ ১: LB + ৩ সার্ভার
await page.getByTestId("toggle-lb").check({ force: true });
await page.getByTestId("add-server").click();
check("চ্যালেঞ্জ ১: ২ সার্ভারে এখনো অসমাধিত", (await banner.count()) === 0);
await page.getByTestId("add-server").click();
check("চ্যালেঞ্জ ১ সফল", (await banner.count()) === 1 && (await banner.innerText()).includes("সফল"));
await page.getByTestId("next-challenge").click();
// চ্যালেঞ্জ ২: Cache
check("চ্যালেঞ্জ ২ শুরুতে অসমাধিত", (await banner.count()) === 0);
await page.getByTestId("toggle-cache").check({ force: true });
check("চ্যালেঞ্জ ২ সফল", (await banner.count()) === 1 && (await banner.innerText()).includes("সফল"));
await page.getByTestId("next-challenge").click();
// চ্যালেঞ্জ ৩: LB + ৫ সার্ভার (N+1)
check("চ্যালেঞ্জ ৩ শুরুতে সিস্টেম বন্ধ", (await page.getByTestId("system-status").getAttribute("data-status")) === "down");
await page.getByTestId("toggle-lb").check({ force: true });
await page.getByTestId("add-server").click();
check("চ্যালেঞ্জ ৩: N+1 ছাড়া অসমাধিত", (await banner.count()) === 0);
await page.getByTestId("add-server").click();
check("চ্যালেঞ্জ ৩ সফল", (await banner.count()) === 1 && (await banner.innerText()).includes("সফল"));
const tabText = await page.getByTestId("tab-challenge").innerText();
check("ট্যাবে ৩/৩ সম্পন্ন দেখায়", tabText.includes("৩/৩"), tabText);
if (shotDir) await page.waitForTimeout(600), await page.screenshot({ path: `${shotDir}/desktop-challenge-done.png`, fullPage: true });

// ৫. রিলোডের পর অগ্রগতি মনে থাকে (storage থাকলে)
await page.reload({ waitUntil: "networkidle" });
await page.getByTestId("diagram").waitFor();
const tabAfter = await page.getByTestId("tab-challenge").innerText();
check("রিলোডের পরও অগ্রগতি থাকে", tabAfter.includes("৩/৩"), tabAfter);

// ---------- মোবাইল ----------
const m = await newPage({ width: 390, height: 844 });
await setRange(m, 1200);
await m.getByTestId("add-server").click();
await m.getByTestId("add-server").click();
await m.getByTestId("toggle-lb").check({ force: true });
const overflow = await m.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
check("৩৯০px-এ আড়াআড়ি স্ক্রল নেই", overflow <= 0, `overflow ${overflow}px`);
const wideEls = await m.evaluate(() =>
  [...document.querySelectorAll("body *")]
    .filter((el) => el.getBoundingClientRect().right > window.innerWidth + 1)
    .map((el) => el.tagName + "." + (el.className?.toString?.() || "").slice(0, 40))
    .slice(0, 5)
);
check("৩৯০px-এ কোনো উপাদান পর্দার বাইরে নেই", wideEls.length === 0, wideEls.join(" | "));
if (shotDir) await m.waitForTimeout(600), await m.screenshot({ path: `${shotDir}/mobile.png`, fullPage: true });
await m.getByTestId("tab-challenge").click();
if (shotDir) await m.waitForTimeout(600), await m.screenshot({ path: `${shotDir}/mobile-challenge.png`, fullPage: true });

// ---------- storage ব্লক থাকলে ----------
const ctx = await browser.newContext({ viewport: { width: 800, height: 700 } });
await ctx.addInitScript(() => {
  Object.defineProperty(window, "localStorage", {
    get() {
      throw new Error("storage blocked");
    },
  });
});
const sp = await ctx.newPage();
const spErrors = [];
sp.on("pageerror", (e) => spErrors.push(e.message));
await sp.goto(url, { waitUntil: "networkidle" });
await sp.getByTestId("add-server").click();
check("localStorage ব্লক থাকলেও অ্যাপ চলে", (await sp.getByTestId("server-count").innerText()) === "২" && spErrors.length === 0, spErrors.join(";"));

check("console-এ কোনো এরর নেই", errors.length === 0, errors.join(" | "));

await browser.close();
const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} পাস`);
process.exit(failed ? 1 : 0);
