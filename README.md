# Scaling ও System Design সিমুলেটর

ট্রাফিক, অ্যাপ সার্ভার, Load Balancer, Cache আর ডাটাবেস নিয়ে হাতে-কলমে system design শেখার ছোট সিমুলেটর।

```bash
npm install
npm run dev            # http://localhost:3000
npm run build:artifact # dist-artifact/index.html (একটা self-contained ফাইল)
node scripts/smoke-test.mjs http://localhost:3000            # ব্রাউজার পরীক্ষা
node scripts/smoke-test.mjs file://$PWD/dist-artifact/index.html
```

- `src/lib/sim.ts`: পুরো হিসাব (pure function) আর তিনটা চ্যালেঞ্জ
- `src/components/Simulator.tsx`: UI
- `scripts/build-single-html.mjs`: Tailwind CSS আর esbuild bundle একটা HTML-এ ঢোকায়
