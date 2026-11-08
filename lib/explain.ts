// "Explain this": one plain sentence for a metric, using the athlete's own numbers when we have
// them. Written explanations (no AI). Training guidance, not medical advice. Pure, for tests.

export type ExplainKey =
  | "hrv" | "resting_hr" | "sleep" | "stress" | "training_load" | "avg_hr" | "max_hr" | "avg_power" | "normalized_power"
  | "cadence_run" | "cadence_bike" | "elevation" | "swolf" | "stroke_rate" | "vertical_oscillation" | "ground_contact"
  | "vertical_ratio" | "stride_length" | "ftp" | "threshold_pace" | "threshold_hr" | "readiness";

export type ExplainCtx = { value?: number | null; baseline?: number | null; maxHr?: number | null; ftp?: number | null; unit?: string };

const r = (v: number) => Math.round(v);
const vs = (c: ExplainCtx, unit: string, higherIsGood: boolean) => {
  if (c.value == null || c.baseline == null || !c.baseline) return "";
  const pct = Math.round(((c.value - c.baseline) / c.baseline) * 100);
  if (Math.abs(pct) < 4) return ` Yours is ${r(c.value)}${unit}, right around your normal of ${r(c.baseline)}.`;
  const good = pct > 0 === higherIsGood;
  return ` Yours is ${r(c.value)}${unit}, ${Math.abs(pct)}% ${pct > 0 ? "above" : "below"} your normal of ${r(c.baseline)}${good ? ", a good sign" : ", so go a little easier if you feel it"}.`;
};

const TEXT: Record<ExplainKey, (c: ExplainCtx) => string> = {
  hrv: (c) => `HRV is the tiny variation between heartbeats; higher than your own normal usually means you're well recovered.${vs(c, " ms", true)}`,
  resting_hr: (c) => `Resting heart rate is your heartbeat at rest; a few beats above your normal can mean fatigue, stress or a cold coming on.${vs(c, " bpm", false)}`,
  sleep: (c) => `Sleep is when most recovery happens; a short night makes hard sessions feel harder.${c.value != null && c.baseline ? ` You slept ${(c.value / 3600).toFixed(1)} h vs your usual ${(c.baseline / 3600).toFixed(1)} h.` : ""}`,
  stress: (c) => `Stress here is your watch's estimate from heart rate patterns (0-100); lower means your body is calmer.${vs(c, "", false)}`,
  readiness: () => "Readiness compares today's HRV, resting heart rate, sleep, stress and recent training to your own last 28 days: green is go, yellow is go easier, red is a good day to back off.",
  training_load: (c) => `Training load estimates how much a session asked of your body, from heart rate and time.${c.value != null && c.baseline ? ` This one was ${r(c.value)}; your typical session is about ${r(c.baseline)}.` : ""}`,
  avg_hr: (c) => `Average heart rate over the session.${c.value != null && c.maxHr ? ` ${r(c.value)} bpm is ${r((c.value / c.maxHr) * 100)}% of your max, ${c.value / c.maxHr < 0.78 ? "an easy aerobic effort" : c.value / c.maxHr < 0.88 ? "a moderate, steady effort" : "a hard effort"}.` : ""}`,
  max_hr: (c) => `The highest heart rate in the session.${c.value != null && c.maxHr ? ` You touched ${r((c.value / c.maxHr) * 100)}% of your max.` : ""}`,
  avg_power: () => "Average power is the work you put into the pedals, in watts; it doesn't care about hills or wind, which makes it a fair way to compare rides.",
  normalized_power: (c) => `Normalized power weights the hard surges, so it reflects how tough a ride with ups and downs really felt.${c.value != null && c.ftp ? ` ${r(c.value)} W is ${r((c.value / c.ftp) * 100)}% of your FTP.` : ""}`,
  cadence_run: (c) => `Running cadence is steps per minute; many runners land between 160 and 185, and a few more steps can make each one lighter.${c.value != null ? ` Yours was ${r(c.value)}.` : ""}`,
  cadence_bike: (c) => `Pedaling cadence is pedal turns per minute; most riders sit between 80 and 95 on the flat.${c.value != null ? ` Yours was ${r(c.value)}.` : ""}`,
  elevation: () => "Elevation gain is the total climbing in the session; hills raise effort, so a slower pace on a hilly day is normal.",
  swolf: (c) => `SWOLF adds your strokes and seconds for one length; lower means more efficient, and it's best compared with your own swims in the same pool.${c.value != null ? ` Yours was ${r(c.value)}.` : ""}`,
  stroke_rate: () => "Stroke rate is how many strokes you take per minute; faster isn't always better if each stroke gets shorter.",
  vertical_oscillation: (c) => `Vertical oscillation is how much you bounce up and down each step; less bounce usually means more of your energy moves you forward.${c.value != null ? ` Yours averaged ${c.value.toFixed(1)} cm (many runners sit around 6-13 cm).` : ""}`,
  ground_contact: (c) => `Ground contact time is how long each foot stays on the ground; it gets shorter as you run faster.${c.value != null ? ` Yours averaged ${r(c.value)} ms.` : ""}`,
  vertical_ratio: (c) => `Vertical ratio is your bounce divided by your stride length; lower means more efficient.${c.value != null ? ` Yours averaged ${c.value.toFixed(1)}%.` : ""}`,
  stride_length: (c) => `Stride length is the distance of each step; it grows naturally as you run faster, so there's no need to force it.${c.value != null ? ` Yours averaged ${c.value.toFixed(2)} m.` : ""}`,
  ftp: (c) => `FTP is roughly the highest power you could hold for about an hour; bike workouts set their targets as a percentage of it.${c.value != null ? ` Yours is ${r(c.value)} W.` : ""}`,
  threshold_pace: () => "Threshold pace is about the fastest pace you could hold for an hour; tempo and interval paces are set from it.",
  threshold_hr: () => "Threshold heart rate is your heart rate at that hard, about-one-hour effort; your heart-rate zones are built around it.",
};

export const explain = (key: ExplainKey, c: ExplainCtx = {}) => TEXT[key](c);

/** Activity tile labels that have an explanation. */
export const TILE_KEYS: Record<string, ExplainKey> = {
  "Avg HR": "avg_hr",
  "Max HR": "max_hr",
  "Avg power": "avg_power",
  "Normalized power": "normalized_power",
  "Elevation gain": "elevation",
  "Training load": "training_load",
  "Avg SWOLF": "swolf",
  "Stroke rate": "stroke_rate",
};
