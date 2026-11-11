import assert from "node:assert/strict";
import { fmt, goalVerdict, predictAll, predictBike, predictRace, predictRun, predictSwim, speedFor, trendOf, triFor } from "./predict.ts";

const today = "2026-11-10";
let n = 0;
const t = (name: string, fn: () => void) => { fn(); n++; console.log("ok", name); };

t("riegel from a 5K", () => {
  const p = predictRun(10000, { today, efforts: [{ date: "2026-11-01", key: "run_5k", seconds: 1200 }], thresholdSpeed: null })!;
  assert.ok(Math.abs(p.range.mid - 1200 * 2 ** 1.06) < 2, String(p.range.mid));
  assert.equal(p.confidence, "rough");
  assert.ok(p.range.low < p.range.mid && p.range.high > p.range.mid);
});
t("old efforts ignored", () => {
  assert.equal(predictRun(10000, { today, efforts: [{ date: "2026-05-01", key: "run_5k", seconds: 1200 }], thresholdSpeed: null }), null);
});
t("threshold + effort blend is good confidence", () => {
  const p = predictRun(10000, { today, efforts: [{ date: "2026-11-01", key: "run_5k", seconds: 1200 }], thresholdSpeed: 4.0 })!;
  assert.equal(p.confidence, "good");
  assert.ok(p.range.mid > 2300 && p.range.mid < 2600, String(p.range.mid));
});
t("fastest effort per distance wins", () => {
  const a = predictRun(5000, { today, efforts: [{ date: "2026-11-01", key: "run_5k", seconds: 1300 }, { date: "2026-11-05", key: "run_5k", seconds: 1250 }], thresholdSpeed: null })!;
  assert.equal(a.range.mid, 1250);
});
t("marathon spread wider", () => {
  const inp = { today, efforts: [{ date: "2026-11-01", key: "run_5k" as const, seconds: 1200 }], thresholdSpeed: null };
  const m = predictRun(42195, inp)!;
  const k = predictRun(5000, inp)!;
  assert.ok((m.range.high - m.range.low) / m.range.mid > (k.range.high - k.range.low) / k.range.mid);
});
t("bike speed sane", () => {
  const v = speedFor(250, 80) * 3.6;
  assert.ok(v > 36 && v < 42, String(v));
  const r = predictBike(40000, 250, 70)!;
  assert.ok(r.mid > 3400 && r.mid < 4200, String(r.mid));
  assert.equal(predictBike(40000, null, 70), null);
});
t("swim from CSS", () => {
  const r = predictSwim(1500, 100)!;
  assert.equal(r.mid, 1500);
  assert.ok(predictSwim(3800, 100)!.mid > 3800);
});
t("tri splits add up and need all three", () => {
  const all = predictAll({ today, efforts: [{ date: "2026-11-01", key: "run_10k", seconds: 2400 }], thresholdSpeed: 4.2, ftp: 260, css: 95, weightKg: 68 });
  const im = all.find((p) => p.key === "tri_ironman")!;
  assert.equal(im.splits!.length, 5);
  assert.equal(im.range.mid, im.splits!.reduce((a, s) => a + s.range.mid, 0));
  assert.ok(im.range.mid > 9 * 3600 && im.range.mid < 13 * 3600, fmt(im.range.mid));
  const none = predictAll({ today, efforts: [], thresholdSpeed: 4.2, ftp: null, css: null, weightKg: null });
  const oly = none.find((p) => p.key === "tri_olympic")!;
  assert.equal(oly.range.mid, 0);
  assert.ok(oly.drivers.some((d) => d.kind === "missing" && /FTP/.test(d.text)));
});
t("race lookups", () => {
  assert.equal(triFor(113).key, "tri_70_3");
  assert.equal(triFor(25).key, "tri_sprint");
  const inp = { today, efforts: [], thresholdSpeed: 4, ftp: 250, css: 100, weightKg: 70 };
  assert.ok(predictRace({ sport: "run", distance_km: 10 }, inp));
  assert.equal(predictRace({ sport: "other", distance_km: 10 }, inp), null);
  assert.equal(predictRace({ sport: "run", distance_km: null }, inp), null);
});
t("goal verdict + trend", () => {
  const r = { mid: 3000, low: 2900, high: 3150 };
  assert.equal(goalVerdict(3200, r)!.tone, "good");
  assert.equal(goalVerdict(2950, r)!.tone, "near");
  assert.equal(goalVerdict(2700, r)!.tone, "far");
  assert.equal(trendOf(3000, 3005), 0);
  assert.equal(trendOf(2950, 3000), -50);
  assert.equal(trendOf(3000, null), null);
});
t("fmt", () => { assert.equal(fmt(3725), "1:02:05"); assert.equal(fmt(95), "1:35"); });
console.log(`${n} passed`);
