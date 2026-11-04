// tests/*.test.ts esbuild দিয়ে bundle করে Node-এর নিজস্ব test runner-এ চালায়
import { build } from "esbuild";
import { readdirSync, mkdirSync, rmSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const out = join(root, "node_modules/.cache/unit-tests");
rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
const entries = readdirSync(join(root, "tests")).filter((f) => f.endsWith(".test.ts")).map((f) => join(root, "tests", f));
await build({ entryPoints: entries, bundle: true, platform: "node", format: "esm", outdir: out, outExtension: { ".js": ".mjs" }, logLevel: "warning" });
const files = readdirSync(out).map((f) => join(out, f));
const r = spawnSync(process.execPath, ["--test", ...files], { stdio: "inherit" });
process.exit(r.status ?? 1);
