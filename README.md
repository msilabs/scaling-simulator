# Scaling ও System Design সিমুলেটর

ট্রাফিক, অ্যাপ সার্ভার, Load Balancer, Cache, Read Replica, ডাটাবেস আর Autoscaling নিয়ে হাতে-কলমে system design শেখার সিমুলেটর।

- **ফ্রি মোড:** এক মুহূর্তের অবস্থা; নিজের মতো সব বদলে দেখো
- **২৪ ঘণ্টা:** সারাদিনের ট্রাফিক, autoscaling আর আগাম প্রস্তুতি; চার্টে চালিয়ে দেখো
- **৬টা চ্যালেঞ্জ:** প্রতিটা একটা ধারণা শেখায়, বাজেটের মধ্যে সমাধান করতে হয়, খরচ অনুযায়ী ১–৩ তারা

```bash
npm install
npm run dev            # http://localhost:3000
npm test               # হিসাবের unit test
npm run build:artifact # dist-artifact/index.html (একটা self-contained ফাইল)
node scripts/smoke-test.mjs http://localhost:3000            # ব্রাউজার পরীক্ষা
node scripts/smoke-test.mjs file://$PWD/dist-artifact/index.html
```

## ফাইল
- `src/lib/model.ts`: এক মুহূর্তের হিসাব (pure function) আর খরচ
- `src/lib/timeline.ts`: ২৪ ঘণ্টার টাইমলাইন, autoscaler, ট্রাফিকের ধরন
- `src/lib/challenges.ts`: ছয়টা চ্যালেঞ্জ, লক্ষ্য, বাজেট, তারা
- `src/components/`: UI (`Simulator.tsx` সব জোড়া দেয়)
- `tests/sim.test.ts`: unit test
- `scripts/build-single-html.mjs`: Tailwind CSS আর esbuild bundle একটা HTML-এ ঢোকায়
