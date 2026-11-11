import assert from "node:assert/strict";
import { hourSpeed, suggestZones, zoneText } from "./zone-suggest.ts";

const e = (id: string, o: object) => ({ activity_id: id, start_time: "2026-11-01T14:00:00Z", sport: "cycling", ...o });

// FTP: best 20 min 300 W → 285; current 270 → suggest (5.6% up).
const s1 = suggestZones({ ftp_w: 270 }, [e("a", { bests: { power_20m: 280 } }), e("b", { bests: { power_20m: 300 } })]);
assert.deepEqual(s1.map((s) => [s.key, s.current, s.suggested, s.activity_id]), [["ftp_w", 270, 285, "b"]]);
// Within 3%: nothing. Lower: nothing.
assert.equal(suggestZones({ ftp_w: 280 }, [e("b", { bests: { power_20m: 300 } })]).length, 0);
assert.equal(suggestZones({ ftp_w: 320 }, [e("b", { bests: { power_20m: 300 } })]).length, 0);
// Dismissed 285 → only suggest again at 3% above it.
assert.equal(suggestZones({ ftp_w: 270, dismissed: { ftp_w: 285 } }, [e("b", { bests: { power_20m: 300 } })]).length, 0);
assert.equal(suggestZones({ ftp_w: 270, dismissed: { ftp_w: 285 } }, [e("b", { bests: { power_20m: 320 } })])[0].suggested, 304);
// Blank FTP gets filled.
assert.equal(suggestZones(null, [e("b", { bests: { power_20m: 200 } })])[0].current, null);

// Threshold pace: 20:00 5K → hour speed below 5K speed (4.17 m/s).
const v = hourSpeed(5000, 1200);
assert.ok(v < 5000 / 1200 && v > 3.6, `${v}`);
const s2 = suggestZones({ threshold_speed_mps: 3.6 }, [e("r", { bests: { run_5k: 1200, run_10k: 2600 } })]);
assert.equal(s2[0].key, "threshold_speed_mps");
assert.match(s2[0].why, /5K: 20:00/);
assert.equal(zoneText("threshold_speed_mps", 4, "km"), "4:10/km");

// Max HR: needs two workouts; uses the second-highest.
assert.equal(suggestZones({ max_hr: 185 }, [e("h1", { max_hr: 210 })]).length, 0);
const s3 = suggestZones({ max_hr: 185 }, [e("h1", { max_hr: 210 }), e("h2", { max_hr: 192 }), e("h3", { max_hr: 180 })]);
assert.deepEqual([s3[0].key, s3[0].suggested], ["max_hr", 192]);
assert.equal(suggestZones({ max_hr: 191 }, [e("h1", { max_hr: 194 }), e("h2", { max_hr: 192 })]).length, 0);

// FTP only from rides: running power (Garmin/Stryd) reads far higher and must never set FTP.
assert.equal(suggestZones({ ftp_w: 190 }, [e("run", { sport: "running", bests: { power_20m: 320 } })]).length, 0, "run power ignored");
assert.equal(suggestZones({ ftp_w: 190 }, [e("tm", { sport: "treadmill_running", bests: { power_20m: 300 } })]).length, 0, "treadmill power ignored");
assert.equal(suggestZones({ ftp_w: 190 }, [e("trail", { sport: "trail_running", bests: { power_20m: 300 } })]).length, 0);
assert.equal(suggestZones({ ftp_w: 190 }, [e("x", { sport: null, bests: { power_20m: 300 } })]).length, 0, "unknown sport ignored");
const mixed = suggestZones({ ftp_w: 190 }, [e("run", { sport: "running", bests: { power_20m: 330 } }), e("ride", { sport: "road_biking", bests: { power_20m: 215 } })]);
assert.equal(mixed[0].suggested, 204, "the ride sets it, not the higher run");
assert.equal(mixed[0].activity_id, "ride");
assert.equal(suggestZones({ ftp_w: 190 }, [e("v", { sport: "virtual_ride", bests: { power_20m: 215 } })])[0].suggested, 204);
console.log("zone suggestions: all passed");
