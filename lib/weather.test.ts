import assert from "node:assert/strict";

import { asPlace, toDays, weatherLine, weatherPack, type DayWeather } from "./weather.ts";

const base: DayWeather = { date: "2026-11-08", high: 20, low: 10, rainChance: 0, feelsMorning: 15, coldMorning: 12, wind: 10, code: 0 };
const items = (w: Partial<DayWeather>, sport = "run", u: "mi" | "km" = "mi") => weatherPack({ ...base, ...w }, sport, u).map((i) => i.item);

assert.deepEqual(items({}), [], "a nice morning adds nothing");
assert.ok(items({ feelsMorning: 30 })[0].startsWith("Extra fluids"));
assert.ok(weatherPack({ ...base, feelsMorning: 30 }, "run", "mi")[0].why!.includes("86°F"), "heat shown in °F for miles people");
assert.ok(weatherPack({ ...base, feelsMorning: 30 }, "run", "km")[0].why!.includes("30°C"));
assert.ok(items({ coldMorning: 0 }).some((i) => i.startsWith("Layers")));
assert.ok(items({ coldMorning: -10 }).some((i) => i.startsWith("Thermal")));
assert.ok(items({ coldMorning: 10 }, "cycling").some((i) => i.startsWith("Arm warmers")), "bikes get cold sooner");
assert.deepEqual(items({ coldMorning: 10 }, "run"), [], "but runners are fine at 50°F");
assert.ok(items({ rainChance: 70 }).includes("Rain jacket or a cap"));
assert.ok(items({ rainChance: 70 }, "cycling").includes("Rain jacket, and lights"));
assert.ok(items({ wind: 40 }, "cycling").some((i) => i.includes("sheltered")));
assert.deepEqual(items({ wind: 40 }, "run"), [], "wind is a bike problem");
assert.ok(items({ code: 75 }).some((i) => i.startsWith("Treadmill")), "snow");
assert.ok(items({ code: 95, rainChance: 80 }).includes("Plan B indoors"));
assert.ok(!items({ code: 95, rainChance: 80 }).includes("Rain jacket or a cap"), "storms replace the rain note");
assert.deepEqual(items({ feelsMorning: 30 }, "swim"), [], "pool swims don't care about heat");

assert.equal(weatherLine({ ...base, high: 31, low: 20, feelsMorning: 29, coldMorning: 22, rainChance: 30 }, "mi"), "68–88°F, clear. Mornings feel like 72°F–84°F. 30% chance of rain.");

assert.equal(asPlace({ name: "Austin, Texas", lat: 30.27, lon: -97.74 })?.name, "Austin, Texas");
assert.equal(asPlace({ lat: 200, lon: 0 }), null);
assert.equal(asPlace(null), null);

const days = toDays(
  {
    time: ["2026-11-08T05:00", "2026-11-08T07:00", "2026-11-08T09:00", "2026-11-08T15:00"],
    apparent_temperature: [5, 8, 14, 25],
    precipitation_probability: [90, 10, null, 80],
    wind_speed_10m: [50, 12, 20, 40],
    weather_code: [95, 1, 3, 95],
  },
  { time: ["2026-11-08"], temperature_2m_max: [26], temperature_2m_min: [4] },
);
assert.deepEqual(days[0], { date: "2026-11-08", high: 26, low: 4, rainChance: 10, feelsMorning: 14, coldMorning: 8, wind: 20, code: 3 }, "only 6-10 am counts for the session");
console.log("weather: all passed");
