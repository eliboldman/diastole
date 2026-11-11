import assert from "node:assert/strict";
import type { SwimSummary } from "../activity/swim.ts";
import { fadeOf, suggestDrills, swimMetrics, trendOf, type SwimMetrics } from "./insights.ts";

let n = 0;
const t = (name: string, fn: () => void) => { fn(); n++; console.log("ok", name); };
// 25 m pool; reps of 100 m (4 lengths) with given strokes/length and time.
const rep = (i: number, spl: number, time: number, rate = 30, stroke: string | null = "freestyle") => ({ n: i, distance_m: 100, time_s: time, sec_per_100: time, rest_s: 15, stroke, lengths: 4, strokes_per_length: spl, swolf: Math.round(time / 4 + spl), stroke_rate: rate, avg_hr: null, max_hr: null });
const sum = (reps: ReturnType<typeof rep>[]): SwimSummary => ({ reps, swim_s: 0, rest_s: 0, distance_m: 0, sec_per_100: null, best_100: null, swolf: null, stroke_rate: null });

t("metrics", () => {
  const m = swimMetrics(sum([rep(1, 10, 100), rep(2, 10, 100)]), { date: "2026-11-01", activity_id: "a" })!;
  assert.equal(m.spl25, 10);
  assert.equal(m.dps, 2.5);
  assert.equal(m.pace100, 100);
  assert.equal(m.swolf25, 35);
  assert.equal(m.rate, 30);
});
t("non-free and tiny swims ignored", () => {
  assert.equal(swimMetrics(sum([rep(1, 10, 100, 30, "breaststroke"), rep(2, 10, 100, 30, "breaststroke")]), { date: "x", activity_id: "a" }), null);
  assert.equal(swimMetrics(sum([{ ...rep(1, 10, 100), distance_m: 50, lengths: 2 }]), { date: "x", activity_id: "a" }), null);
});
t("fade flagged when count climbs", () => {
  const f = fadeOf(sum([rep(1, 10, 100), rep(2, 10, 100), rep(3, 11.5, 104), rep(4, 12, 106)]))!;
  assert.ok(f.flagged, JSON.stringify(f));
  assert.ok(f.spl25 >= 1);
  assert.match(f.text, /crept up/);
});
t("steady swim not flagged", () => {
  const f = fadeOf(sum([rep(1, 10, 100), rep(2, 10, 101), rep(3, 10, 104), rep(4, 10.2, 106)]))!;
  assert.equal(f.flagged, false);
  assert.match(f.text, /fitness, not form/);
  assert.equal(fadeOf(sum([rep(1, 10, 100), rep(2, 10, 100)])), null);
});
const ms = (dps: number[], spl = 10, rate = 30): SwimMetrics[] => dps.map((d, i) => ({ date: `2026-10-${10 + i}`, activity_id: String(i), meters: 1500, pace100: 100, spl25: spl, dps: d, rate, swolf25: 35 }));
t("trend", () => {
  assert.equal(trendOf(ms([2, 2, 2]), "dps"), null);
  const tr = trendOf(ms([2.5, 2.5, 2.4, 2.3, 2.2, 2.2]), "dps")!;
  assert.ok(tr.pct < -5, String(tr.pct));
});
t("drills from rules", () => {
  assert.deepEqual(suggestDrills(ms([2.5, 2.5, 2.5]), [null, null, null]), []);
  const short = suggestDrills(ms([1.6, 1.6, 1.6], 16), []);
  assert.ok(short.some((s) => s.key === "catch_up") && short.some((s) => s.key === "fingertip"));
  const fadeF = { pace100: 3, spl25: 1.5, dpsPct: -8, rate: 1, flagged: true, text: "" };
  const fading = suggestDrills(ms([2.5, 2.5, 2.5]), [fadeF, null, fadeF]);
  assert.equal(fading[0].key, "hold_form");
  const quick = suggestDrills(ms([2.0, 2.0, 2.0], 12, 42), []);
  assert.ok(quick.some((s) => s.key === "six_kick"));
  const slow = suggestDrills(ms([2.6, 2.6, 2.6], 9, 20), []);
  assert.ok(slow.some((s) => s.key === "tempo_up"));
  assert.ok(suggestDrills(ms([1.5, 1.5, 1.5], 18, 42), [fadeF, fadeF]).length <= 4);
});
console.log(`${n} passed`);
