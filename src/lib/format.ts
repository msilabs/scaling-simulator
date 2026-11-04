// বাংলা অঙ্ক, শতাংশ, টাকা আর সময় দেখানোর ছোট সাহায্যকারী

const DIGITS = "০১২৩৪৫৬৭৮৯";

/** ইংরেজি অঙ্ককে বাংলা অঙ্কে */
export function bn(value: number | string, digits = 0): string {
  const s = typeof value === "number" ? value.toFixed(digits) : value;
  return s.replace(/[0-9]/g, (d) => DIGITS[Number(d)]);
}

/** ভগ্নাংশকে শতাংশে: ০.৯৯৫ → "৯৯.৫%" */
export function pct(fraction: number): string {
  const p = fraction * 100;
  // ৯৯.৯৫%-কে "১০০%" দেখালে মনে হয় কিছুই হারায়নি, তাই ৯৯-এর ঘরে নিচের দিকে কাটা
  if (p >= 99 && p < 100) return bn(String(Math.floor(p * 10) / 10)) + "%";
  return bn(String(p >= 10 || p === 0 ? Math.round(p) : Math.round(p * 10) / 10)) + "%";
}

/** ৳ সংখ্যা, হাজারের কমা দিয়ে (দক্ষিণ এশীয় ধাঁচে: ১,২৫,০০০) */
export function taka(amount: number): string {
  const n = Math.round(amount);
  const s = String(Math.abs(n));
  const last3 = s.slice(-3);
  const rest = s.slice(0, -3).replace(/\B(?=(\d{2})+(?!\d))/g, ",");
  return "৳" + bn((n < 0 ? "-" : "") + (rest ? rest + "," : "") + last3);
}

/** বড় সংখ্যা ছোট করে: ৪৫ লাখ, ১.২ কোটি */
export function compact(n: number): string {
  if (n >= 1e7) return bn(Math.round(n / 1e6) / 10) + " কোটি";
  if (n >= 1e5) return bn(Math.round(n / 1e4) / 10) + " লাখ";
  if (n >= 1e3) return bn(Math.round(n / 100) / 10) + " হাজার";
  return bn(Math.round(n));
}

/** মিনিট (০–১৪৩৯) থেকে "রাত ৮:১০" ধাঁচের সময় */
export function clock(minute: number): string {
  const h24 = Math.floor(minute / 60) % 24;
  const m = minute % 60;
  const part = h24 < 4 ? "রাত" : h24 < 6 ? "ভোর" : h24 < 12 ? "সকাল" : h24 < 16 ? "দুপুর" : h24 < 18 ? "বিকেল" : h24 < 20 ? "সন্ধ্যা" : "রাত";
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${part} ${bn(h12)}:${bn(String(m).padStart(2, "0"))}`;
}

/** ঘণ্টা (০–২৪) থেকে "রাত ৮টা" */
export function hourLabel(h: number): string {
  const h24 = h % 24;
  const part = h24 < 4 ? "রাত" : h24 < 6 ? "ভোর" : h24 < 12 ? "সকাল" : h24 < 16 ? "দুপুর" : h24 < 18 ? "বিকেল" : h24 < 20 ? "সন্ধ্যা" : "রাত";
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${part} ${bn(h12)}টা`;
}
