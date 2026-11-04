// localStorage কোথাও কোথাও কাজ না-ও করতে পারে (private window, artifact preview, ব্লক করা storage)।
// তাই প্রতিটা read/write try/catch-এ মোড়ানো; ব্যর্থ হলে অ্যাপ স্বাভাবিকভাবে চলবে, শুধু মনে রাখবে না।

const KEY = "scaling-sim:v1";

export type Saved = {
  mode?: "free" | "challenge";
  free?: unknown;
  challengeIndex?: number;
  completed?: string[];
};

export function loadSaved(): Saved {
  try {
    if (typeof window === "undefined") return {};
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? (parsed as Saved) : {};
  } catch {
    return {};
  }
}

export function save(data: Saved): void {
  try {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(KEY, JSON.stringify(data));
  } catch {
    // storage নেই বা ভরা; চুপচাপ বাদ
  }
}

export function clearSaved(): void {
  try {
    if (typeof window === "undefined") return;
    window.localStorage.removeItem(KEY);
  } catch {
    // কিছু করার নেই
  }
}
