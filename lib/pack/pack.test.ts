import assert from "node:assert/strict";
import { cleanMaster, cleanPackState, fuelQuantities, packList, timeline, wetsuitCall, type PackInput } from "./pack.ts";

let n = 0;
const t = (name: string, fn: () => void) => { fn(); n++; console.log("ok", name); };
const base: PackInput = { sport: "tri", distanceKm: 113, minutes: 330, weather: null, waterC: null, travel: "local", gear: [{ leg: "run", item: { item: "Alphafly 3" } }, { leg: "bike", item: { item: "Cervelo P3" } }, { leg: "bike", item: { item: "Find a pool" } }], fuel: null, master: [], extra: [], units: "mi" };
const plan = { minutes: 330, carbsPerHour: 80, fluidMlPerHour: 600, sodiumMgPerHour: 500, carbLoad: null, breakfast: { hoursBefore: 3, gPerKg: [1, 3] as [number, number], grams: [70, 200] as [number, number] }, feeds: [], notes: [] };

t("wetsuit rules", () => {
  assert.equal(wetsuitCall(null, "mi"), null);
  assert.match(wetsuitCall(30, "mi")!.label, /only/);
  assert.match(wetsuitCall(26.5, "mi")!.label, /Swimskin/);
  assert.equal(wetsuitCall(20, "km")!.label, "Wetsuit");
  assert.match(wetsuitCall(14, "km")!.label, /neoprene cap/);
  assert.match(wetsuitCall(11, "km")!.label, /booties/);
});
t("tri list has bags and gear in the right one", () => {
  const l = packList(base);
  assert.ok(l.some((i) => i.bag === "t1") && l.some((i) => i.bag === "t2") && l.some((i) => i.bag === "special"));
  assert.equal(l.find((i) => i.label === "Alphafly 3")!.bag, "t2");
  assert.equal(l.find((i) => i.label === "Cervelo P3")!.bag, "t1");
  assert.equal(new Set(l.map((i) => i.key)).size, l.length, "no duplicates");
  assert.ok(!l.some((i) => i.label === "Find a pool"));
});
t("run list has no tri bags", () => {
  const l = packList({ ...base, sport: "run", distanceKm: 21.1, minutes: 100, master: [{ label: "Body glide", bag: "t1" }] });
  assert.ok(!l.some((i) => ["swim", "t1", "t2", "special"].includes(i.bag)));
  assert.equal(l.find((i) => i.label === "Body glide")!.bag, "morning");
});
t("fuel quantities", () => {
  const f = fuelQuantities(plan, "tri");
  const gels = f.find((i) => i.key === "fuel-gels")!;
  assert.equal(gels.qty, "18 (+2 spare)");
  assert.match(f.find((i) => i.key === "fuel-fluid")!.qty!, /3\.3 L/);
  assert.match(f.find((i) => i.key === "fuel-salt")!.qty!, /11 ×/);
  assert.equal(fuelQuantities({ ...plan, minutes: 40 }, "run").length, 1);
});
t("travel + weather + coach + mine", () => {
  const l = packList({ ...base, travel: "fly", weather: { date: "x", high: 30, low: 20, rainChance: 70, feelsMorning: 29, coldMorning: 18, wind: 35, code: 0 }, waterC: 19, master: [{ label: "Spare cleats", bag: "t1", sports: ["tri"] }, { label: "Run only", bag: "morning", sports: ["run"] }], extra: [{ label: "Lucky socks", bag: "t2" }] });
  assert.ok(l.some((i) => /Bike box/.test(i.label)));
  assert.ok(l.some((i) => i.source === "weather" && /fluids/.test(i.label)));
  assert.ok(l.some((i) => /Rain jacket/.test(i.label)));
  assert.equal(l.find((i) => i.key === "wetsuit")!.label, "Wetsuit");
  assert.ok(l.some((i) => i.label === "Spare cleats" && i.source === "coach"));
  assert.ok(!l.some((i) => i.label === "Run only"));
  assert.ok(l.some((i) => i.label === "Lucky socks" && i.source === "mine"));
});
t("timeline", () => {
  const tl = timeline("tri", "fly");
  assert.deepEqual(tl.map((r) => r.daysOut), [7, 5, 4, 3, 2, 1]);
  assert.deepEqual(timeline("run", "local").map((r) => r.daysOut), [7, 3, 2, 1]);
});
t("clean state + master", () => {
  const s = cleanPackState({ checked: { a: true, b: "yes" }, extra: [{ label: " x ", bag: "t1" }, { label: "", bag: "t1" }, { label: "y", bag: "nope" }], travel: "fly", waterC: "19.44" });
  assert.deepEqual(s.checked, { a: true });
  assert.deepEqual(s.extra, [{ label: "x", bag: "t1" }]);
  assert.equal(s.travel, "fly");
  assert.equal(s.waterC, 19.4);
  assert.equal(cleanPackState(null).travel, "local");
  assert.deepEqual(cleanMaster([{ label: "A", bag: "t2", sports: ["tri", "zz"] }, { label: "", bag: "t2" }]), [{ label: "A", bag: "t2", sports: ["tri"] }]);
});
console.log(`${n} passed`);
