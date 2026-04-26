/* eslint-disable no-console */
//
// Deterministic PRNG (mulberry32) + helpers for seeding demo data.
// Re-running the seed with the same seed produces byte-identical output
// (provided the seed code itself doesn't change). Override via env:
//
//   SEED=42 npm run seed:beauty2go-demo
//

const DEFAULT_SEED = 0xb2_e0_1d; // arbitrary fixed seed: "B2.OLD"

function mulberry32(seed: number): () => number {
  let s = seed >>> 0;
  return function () {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export type Prng = ReturnType<typeof makePrng>;

export function makePrng(seed: number = DEFAULT_SEED) {
  const env = process.env.SEED;
  const actual = env ? Number(env) || seed : seed;
  const rand = mulberry32(actual);

  return {
    next: () => rand(),
    /** Random integer in [min, max). */
    range: (min: number, max: number) => Math.floor(rand() * (max - min)) + min,
    pick: <T>(arr: readonly T[]): T => arr[Math.floor(rand() * arr.length)],
    weighted: <T extends { weight: number }>(items: readonly T[]): T => {
      const total = items.reduce((s, i) => s + i.weight, 0);
      let r = rand() * total;
      for (const item of items) {
        r -= item.weight;
        if (r < 0) return item;
      }
      return items[items.length - 1];
    },
    /**
     * Random Date in `[endMsAgo, startMsAgo)` — both expressed as ms ago
     * from now. Example: dateInRange(0, 30 * 86400_000) returns a date in
     * the past 30 days (where "0 ms ago" is "now").
     */
    dateInRange: (endMsAgo: number, startMsAgo: number): Date => {
      const span = startMsAgo - endMsAgo;
      const offset = Math.floor(rand() * span);
      return new Date(Date.now() - endMsAgo - offset);
    },
  };
}
