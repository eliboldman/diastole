-- Breathwork live heart rate (2026-11-23): from a Bluetooth sensor (Garmin "Broadcast Heart Rate", a chest strap).
alter table public.breath_sessions
  add column hr_start  smallint check (hr_start between 25 and 240),   -- avg bpm, first minute
  add column hr_end    smallint check (hr_end between 25 and 240),     -- avg bpm, last minute
  add column hr_swing  numeric(4, 1) check (hr_swing between 0 and 80), -- avg peak-to-trough bpm per breath
  add column rmssd     numeric(5, 1) check (rmssd between 0 and 400),  -- ms, when the sensor sends beat-to-beat intervals
  add column hr_swings jsonb check (hr_swings is null or jsonb_typeof(hr_swings) = 'object'), -- finder: {"6.5": 7.2, ...}
  add column hr_device text check (hr_device is null or char_length(hr_device) <= 60);
