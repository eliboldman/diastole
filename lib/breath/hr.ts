// Live heart rate during breathing (2026-11-23): parse the standard Bluetooth heart-rate packet (what a Garmin
// watch's "Broadcast Heart Rate", a chest strap, or an Apple Watch HR app sends), and summarise a session:
// heart rate at the start vs the end, how far it swings with each breath, and RMSSD when beat-to-beat
// intervals come through (chest straps usually send them; wrist broadcasts often don't). Pure, for tests.

export type HrSample = { t: number; bpm: number }; // t = seconds from the start of the segment
export type HrPacket = { bpm: number | null; rr: number[] }; // rr in ms

/** Heart Rate Measurement (0x2A37): flags, bpm (8 or 16 bit), optional energy, optional RR intervals (1/1024 s). */
export function parseHeartRate(view: DataView): HrPacket {
  if (view.byteLength < 2) return { bpm: null, rr: [] };
  const flags = view.getUint8(0);
  let i = 1;
  let bpm: number;
  if (flags & 0x01) {
    if (view.byteLength < 3) return { bpm: null, rr: [] };
    bpm = view.getUint16(i, true);
    i += 2;
  } else {
    bpm = view.getUint8(i);
    i += 1;
  }
  if (flags & 0x08) i += 2; // energy expended
  const rr: number[] = [];
  if (flags & 0x10) {
    for (; i + 1 < view.byteLength; i += 2) rr.push(Math.round((view.getUint16(i, true) / 1024) * 1000));
  }
  return { bpm: bpm > 25 && bpm < 240 ? bpm : null, rr: rr.filter((x) => x >= 270 && x <= 2000) };
}

const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;

/**
 * How far heart rate rises and falls with each breath: the average peak-to-trough within each breath
 * window, skipping the first 30 s while the body settles. Needs a few breaths' worth of samples.
 */
export function breathSwing(samples: HrSample[], cycleSeconds: number, settle = 30): number | null {
  if (!(cycleSeconds > 0) || !samples.length) return null;
  const end = samples[samples.length - 1].t;
  const swings: number[] = [];
  for (let from = settle; from + cycleSeconds <= end + 0.5; from += cycleSeconds) {
    const inside = samples.filter((s) => s.t >= from && s.t < from + cycleSeconds).map((s) => s.bpm);
    if (inside.length >= Math.max(3, Math.floor(cycleSeconds / 2))) swings.push(Math.max(...inside) - Math.min(...inside));
  }
  return swings.length >= 3 ? Math.round(mean(swings) * 10) / 10 : null;
}

/** RMSSD from beat-to-beat intervals, dropping jumps of more than 20% (missed or extra beats). */
export function rmssd(rr: number[]): number | null {
  const diffs: number[] = [];
  for (let i = 1; i < rr.length; i++) {
    if (Math.abs(rr[i] - rr[i - 1]) / rr[i - 1] > 0.2) continue;
    diffs.push((rr[i] - rr[i - 1]) ** 2);
  }
  return diffs.length >= 30 ? Math.round(Math.sqrt(mean(diffs)) * 10) / 10 : null;
}

/** Heart rate over the first and last minute, the per-breath swing, and RMSSD when there are intervals. */
export function summarise(samples: HrSample[], rr: number[], cycleSeconds: number) {
  if (samples.length < 20) return null;
  const end = samples[samples.length - 1].t;
  const first = samples.filter((s) => s.t <= Math.min(60, end / 3)).map((s) => s.bpm);
  const last = samples.filter((s) => s.t >= end - Math.min(60, end / 3)).map((s) => s.bpm);
  return {
    start: first.length ? Math.round(mean(first)) : null,
    end: last.length ? Math.round(mean(last)) : null,
    swing: breathSwing(samples, cycleSeconds),
    rmssd: rmssd(rr),
  };
}
