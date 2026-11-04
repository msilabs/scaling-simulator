# CLAUDE.md

## Git-এর নিয়ম (সবসময় মানতে হবে)

- **Commit শুধু এই নাম আর ইমেইলে:** `msisaif <61042251+msisaif@users.noreply.github.com>`। author আর committer দুটোই এটা।
- **Commit মেসেজে কোনো attribution লাইন থাকবে না:** `Co-Authored-By`, `Claude-Session`, "Generated with Claude", 🤖 বা এই ধরনের কিছু না। PR-এর বর্ণনাতেও না।
- **আমি না বললে push করবে না।** commit করা যাবে, কিন্তু push শুধু স্পষ্ট করে বলার পর।

## প্রজেক্ট

Scaling ও System Design সিমুলেটর (Next.js + Tailwind)। UI বাংলায়।

- `npm run dev`: http://localhost:3000
- `npm test`: হিসাবের unit test (`tests/`)
- `npm run build:artifact`: একক HTML ফাইল `dist-artifact/index.html`-এ
- `node scripts/smoke-test.mjs <url>`: Playwright দিয়ে ব্রাউজার পরীক্ষা

হিসাবের কোড `src/lib/`-এ, pure function হিসেবে রাখা (`model.ts`, `timeline.ts`, `challenges.ts`)। চ্যালেঞ্জের সংখ্যা বা মান বদলালে `npm test` চালিয়ে দেখো জানা সমাধানগুলো এখনো ঠিক আছে কি না।
