// ব্রাউজারে অ্যাপ চালিয়ে মূল আচরণগুলো যাচাই করে।
// ব্যবহার: node scripts/smoke-test.mjs <url> [screenshot-dir]
// উদাহরণ: node scripts/smoke-test.mjs http://localhost:3000 shots
//          node scripts/smoke-test.mjs file://$PWD/dist-artifact/index.html
import { createRequire } from "node:module";
import { mkdirSync } from "node:fs";

// পরিবেশে আগে থেকে ইনস্টল করা Playwright (CommonJS require দিয়ে খোঁজে)
const { chromium } = createRequire(import.meta.url)("playwright");

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

async function newPage(viewport, opts = {}) {
  const ctx = await browser.newContext({ viewport, ...opts });
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

const shot = async (page, name) => {
  if (!shotDir) return;
  await page.waitForTimeout(600);
  await page.screenshot({ path: `${shotDir}/${name}.png`, fullPage: true });
};
const health = (page, id) => page.getByTestId(id).getAttribute("data-health");
const status = (page) => page.getByTestId("system-status").getAttribute("data-status");
const setRange = (page, testId, value) =>
  page.getByTestId(testId).evaluate((el, v) => {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set;
    setter.call(el, String(v));
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
  }, value);
const on = (page, id) => page.getByTestId(id).check({ force: true });
const off = (page, id) => page.getByTestId(id).uncheck({ force: true });
const click = (page, id, times = 1) => (async () => {
  for (let i = 0; i < times; i++) await page.getByTestId(id).click();
})();

// ================= ডেস্কটপ: ফ্রি মোড =================
const page = await newPage({ width: 1280, height: 900 });
check("প্রথমবার খুললে গাইড দেখায়", (await page.getByTestId("intro").count()) === 1);
await shot(page, "desktop-start");
await page.getByRole("button", { name: "নিজে নিজে খেলি" }).click();
check("গাইড বন্ধ করা যায়", (await page.getByTestId("intro").count()) === 0);

await setRange(page, "traffic", 500);
check("ট্রাফিক ৫০০-তে সার্ভার ১ লাল", (await health(page, "server-1")) === "bad");
await click(page, "servers-plus", 4);
check("LB ছাড়া সার্ভার যোগ করলেও সার্ভার ১ লাল থাকে", (await health(page, "server-1")) === "bad");
const costNoLb = Number(await page.getByTestId("monthly-cost").getAttribute("data-cost"));
await on(page, "toggle-lb");
const greens = await Promise.all([1, 2, 3, 4, 5].map((i) => health(page, `server-${i}`)));
check("৫ সার্ভার + LB দিলে সব সবুজ", greens.every((h) => h === "ok"), greens.join(","));
const costLb = Number(await page.getByTestId("monthly-cost").getAttribute("data-cost"));
check("LB যোগ করলে খরচ ৳২,৫০০ বাড়ে", costLb - costNoLb === 2500, `${costNoLb} → ${costLb}`);
await shot(page, "desktop-scaled");

const dbBefore = Number(await page.getByTestId("db-node").getAttribute("data-util"));
await on(page, "toggle-cache");
const dbAfter = Number(await page.getByTestId("db-node").getAttribute("data-util"));
check("Cache চালু করলে ডাটাবেস লোড কমে", dbAfter < dbBefore, `${dbBefore} → ${dbAfter}`);

await setRange(page, "traffic", 1000);
check("ঠিক ১০০% লোডে সার্ভার ‘পূর্ণ’, লাল নয়", (await health(page, "server-1")) === "full");
check("১০০% লোডে সব রিকোয়েস্ট সফল", (await page.getByTestId("success-rate").innerText()) === "১০০%");
await setRange(page, "traffic", 500);

await click(page, "replicas-plus");
check("Read Replica যোগ করলে ডায়াগ্রামে দেখায়", (await page.getByTestId("replica-node").count()) === 1);
await click(page, "replicas-minus");

await page.getByRole("button", { name: "এটা কী?" }).first().click();
check("‘এটা কী?’ চাপলে ব্যাখ্যা খোলে", (await page.getByRole("note").count()) === 1);

await off(page, "toggle-lb");
await page.getByTestId("server-1").click();
check("LB ছাড়া সার্ভার ১ বন্ধ করলে সিস্টেম বন্ধ", (await status(page)) === "down");
check("‘পুরো সিস্টেম বন্ধ’ লেখা দেখায়", (await page.getByTestId("system-status").innerText()).includes("পুরো সিস্টেম বন্ধ"));
await shot(page, "desktop-down");
await on(page, "toggle-lb");
check("LB চালু করলে বাকি সার্ভার দিয়ে সিস্টেম আবার চালু", (await status(page)) !== "down");

// ================= ডেস্কটপ: ২৪ ঘণ্টা =================
await page.getByTestId("tab-day").click();
await page.getByTestId("day-chart").waitFor();
const daySuccess0 = await page.getByTestId("day-success").innerText();
check("২৪ ঘণ্টা: ৬টা স্থায়ী সার্ভারে ফ্ল্যাশ সেলে রিকোয়েস্ট হারায়", !daySuccess0.startsWith("১০০"), daySuccess0);
const before = await page.getByTestId("scrub").inputValue();
await page.getByTestId("play").click();
await page.waitForTimeout(500);
await page.getByTestId("play").click();
const after = await page.getByTestId("scrub").inputValue();
check("‘দিনটা চালাও’ চাপলে সময় এগোয়", Number(after) !== Number(before), `${before} → ${after}`);
const box = await page.getByTestId("day-chart").boundingBox();
await page.mouse.move(box.x + box.width * 0.5, box.y + box.height * 0.5);
check("চার্টে মাউস রাখলে tooltip দেখায়", (await page.getByRole("tooltip").count()) === 1);
await on(page, "toggle-autoscale");
const autoCost = await page.getByTestId("day-cost").innerText();
check("Autoscaling চালু করা যায়, খরচ হিসাব হয়", autoCost.startsWith("৳"), autoCost);
await shot(page, "desktop-day");

// ================= ডেস্কটপ: ছয়টা চ্যালেঞ্জ =================
await page.getByTestId("tab-challenge").click();
const banner = page.getByTestId("success-banner");
const isSolved = async () => (await banner.count()) === 1 && (await banner.innerText()).includes("সফল");
const starsText = async () => (await banner.innerText()).includes("সবচেয়ে সাশ্রয়ী");

check("চ্যালেঞ্জ ১ শুরুতে অসমাধিত", !(await isSolved()));
await on(page, "toggle-lb");
await click(page, "servers-plus");
check("চ্যালেঞ্জ ১: ২ সার্ভারে এখনো অসমাধিত", !(await isSolved()));
await click(page, "servers-plus");
check("চ্যালেঞ্জ ১ সফল, ৩ তারা", (await isSolved()) && (await starsText()));
await click(page, "next-challenge");

check("চ্যালেঞ্জ ২ শুরুতে অসমাধিত", !(await isSolved()));
await on(page, "toggle-cache");
check("চ্যালেঞ্জ ২ সফল", await isSolved());
check("চ্যালেঞ্জ ২: ৬ সার্ভারে ৩ তারা নয়", !(await starsText()));
await click(page, "servers-minus");
check("চ্যালেঞ্জ ২: একটা সার্ভার কমালে ৩ তারা", (await isSolved()) && (await starsText()));
await click(page, "next-challenge");

check("চ্যালেঞ্জ ৩ শুরুতে সিস্টেম বন্ধ", (await status(page)) === "down");
await on(page, "toggle-lb");
await click(page, "servers-plus");
check("চ্যালেঞ্জ ৩: N+1 ছাড়া অসমাধিত", !(await isSolved()));
await click(page, "servers-plus");
check("চ্যালেঞ্জ ৩ সফল", await isSolved());
await click(page, "next-challenge");

check("চ্যালেঞ্জ ৪ শুরুতে অসমাধিত", !(await isSolved()));
await click(page, "servers-plus", 3);
check("চ্যালেঞ্জ ৪: সার্ভার বাড়িয়ে সমাধান হয় না", !(await isSolved()));
await click(page, "servers-minus", 3);
await click(page, "replicas-plus");
check("চ্যালেঞ্জ ৪: Read Replica দিলে সফল", await isSolved());
await click(page, "next-challenge");

await page.getByTestId("day-chart").waitFor();
check("চ্যালেঞ্জ ৫ শুরুতে অসমাধিত", !(await isSolved()));
await on(page, "toggle-autoscale");
check("চ্যালেঞ্জ ৫: শুধু autoscaling-এ হয় না", !(await isSolved()));
await on(page, "toggle-prewarm");
await page.getByTestId("prewarm-from").selectOption("20");
await click(page, "prewarm-min-plus");
check("চ্যালেঞ্জ ৫: রাত ৮টা থেকে প্রস্তুতি নিলে দেরি হয়ে যায়", !(await isSolved()));
await page.getByTestId("prewarm-from").selectOption("19");
check("চ্যালেঞ্জ ৫: সন্ধ্যা ৭টা থেকে প্রস্তুতি নিলে সফল", await isSolved());
await shot(page, "desktop-challenge-5");
await click(page, "next-challenge");

check("চ্যালেঞ্জ ৬ শুরুতে অসমাধিত", !(await isSolved()));
await page.getByTestId("target").locator('[data-value="0.5"]').click();
check("চ্যালেঞ্জ ৬: লক্ষ্য লোড ৫০% করলে সফল", await isSolved());
check("শেষ চ্যালেঞ্জে ‘সব শেষ’ বার্তা", (await banner.innerText()).includes("ছয়টা চ্যালেঞ্জই শেষ"));
const tab = await page.getByTestId("tab-challenge").innerText();
check("ট্যাবে মোট তারা দেখায়", /★[০-৯]{2}/.test(tab), tab);

await page.reload({ waitUntil: "networkidle" });
await page.getByTestId("diagram").waitFor();
check("রিলোডের পরও তারা থাকে", (await page.getByTestId("tab-challenge").innerText()) === tab, await page.getByTestId("tab-challenge").innerText());

await page.getByRole("button", { name: "সব অগ্রগতি মুছে নতুন করে শুরু" }).click();
check("‘সব মুছে’ চাপলে আগে নিশ্চিত হতে চায়", (await page.getByTestId("tab-challenge").innerText()) === tab);
await page.getByRole("button", { name: "হ্যাঁ, মুছে দাও" }).click();
check("নিশ্চিত করলে সব মুছে যায়", (await page.getByTestId("tab-challenge").innerText()).includes("★০"));

// ================= মোবাইল =================
async function noOverflow(m, label) {
  const overflow = await m.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  const wide = await m.evaluate(() =>
    [...document.querySelectorAll("body *")]
      .filter((el) => {
        const r = el.getBoundingClientRect();
        return r.width > 0 && r.right > window.innerWidth + 1 && !el.closest(".overflow-auto");
      })
      .map((el) => el.tagName + "." + (el.className?.toString?.() || "").slice(0, 40))
      .slice(0, 4)
  );
  check(`৩৯০px ${label}: আড়াআড়ি স্ক্রল বা বাইরে যাওয়া উপাদান নেই`, overflow <= 0 && wide.length === 0, `overflow ${overflow}px ${wide.join(" | ")}`);
}
const m = await newPage({ width: 390, height: 844 });
await m.getByRole("button", { name: "নিজে নিজে খেলি" }).click();
await setRange(m, "traffic", 1200);
await m.getByTestId("servers-plus").click();
await m.getByTestId("servers-plus").click();
await on(m, "toggle-lb");
await noOverflow(m, "ফ্রি মোড");
check("মোবাইলে নিচে স্থির অবস্থা-বার দেখায়", await m.getByTestId("mobile-bar").isVisible());
await shot(m, "mobile-free");
await m.getByTestId("tab-day").click();
await m.getByTestId("day-chart").waitFor();
await noOverflow(m, "২৪ ঘণ্টা");
await shot(m, "mobile-day");
await m.getByTestId("tab-challenge").click();
await noOverflow(m, "চ্যালেঞ্জ");
const panelTop = (await m.getByTestId("challenge-panel").boundingBox()).y;
const diagramTop = (await m.getByTestId("diagram").boundingBox()).y;
check("মোবাইলে চ্যালেঞ্জের বিবরণ ডায়াগ্রামের আগে", panelTop < diagramTop);
await shot(m, "mobile-challenge");

// ================= ডার্ক মোড =================
const d = await newPage({ width: 1280, height: 900 }, { colorScheme: "dark" });
const bg = await d.evaluate(() => getComputedStyle(document.body).backgroundColor);
check("ডার্ক মোডে গাঢ় পটভূমি", bg === "rgb(13, 22, 32)", bg);
await d.getByTestId("tab-day").click();
await shot(d, "desktop-dark-day");

// ================= storage ব্লক থাকলে =================
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
await sp.getByTestId("servers-plus").click();
check(
  "localStorage ব্লক থাকলেও অ্যাপ চলে",
  (await sp.getByTestId("servers-value").innerText()) === "২" && spErrors.length === 0,
  spErrors.join(";")
);

check("console-এ কোনো এরর নেই", errors.length === 0, errors.join(" | "));

await browser.close();
const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} পাস`);
process.exit(failed ? 1 : 0);
