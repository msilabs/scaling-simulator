// পুরো অ্যাপকে একটা self-contained HTML ফাইলে বানায়: dist-artifact/index.html
// - Tailwind CSS তৈরি করে <style>-এ ঢোকায়
// - esbuild দিয়ে অ্যাপ (React সহ) একটা JS-এ bundle করে <script>-এ ঢোকায়
// - ফন্ট আসে Google Fonts-এর লিংক থেকে
import { build } from "esbuild";
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = join(root, "dist-artifact");
const tmpDir = join(outDir, ".tmp");
rmSync(outDir, { recursive: true, force: true });
mkdirSync(tmpDir, { recursive: true });

// ১. Tailwind CSS
const cssOut = join(tmpDir, "app.css");
execFileSync(
  process.execPath,
  [join(root, "node_modules/tailwindcss/lib/cli.js"), "-c", join(root, "tailwind.config.js"), "-i", join(root, "src/app/globals.css"), "-o", cssOut, "--minify"],
  { cwd: root, stdio: "inherit" }
);
const css = readFileSync(cssOut, "utf8");

// ২. JS bundle
const result = await build({
  entryPoints: [join(root, "scripts/artifact-entry.tsx")],
  bundle: true,
  minify: true,
  format: "iife",
  target: ["es2019"],
  jsx: "automatic",
  write: false,
  legalComments: "none",
  alias: { "@": join(root, "src") },
  define: { "process.env.NODE_ENV": '"production"' },
  logLevel: "warning",
});
// </script> যেন inline স্ক্রিপ্ট ভেঙে না দেয়
const js = result.outputFiles[0].text.replace(/<\/script/gi, "<\\/script");

// ৩. HTML (artifact-এর skeleton নিজেই <html>/<head>/<body> দেয়; ব্রাউজারে সরাসরি খুললেও এটা ঠিকঠাক চলে)
const html = `<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>Scaling ও System Design সিমুলেটর</title>
<meta name="claude:viewport-fit-sides" content="cover">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Hind+Siliguri:wght@400;500;600;700&family=JetBrains+Mono:wght@400;600&display=swap">
<style>${css}</style>
<div id="root"></div>
<script>${js}</script>
`;

writeFileSync(join(outDir, "index.html"), html);
rmSync(tmpDir, { recursive: true, force: true });

// কোনো লোকাল ফাইলের রেফারেন্স রয়ে গেল কি না যাচাই
const bad = html.match(/(src|href)=["'](?!https:\/\/)[^"']+["']/g) || [];
if (/\/_next\//.test(html) || bad.length) {
  console.error("লোকাল রেফারেন্স পাওয়া গেছে:", bad);
  process.exit(1);
}
console.log(`dist-artifact/index.html তৈরি (${(Buffer.byteLength(html) / 1024).toFixed(0)} KB)`);
