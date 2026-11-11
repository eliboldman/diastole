// Strength exercises for endurance athletes: muscles worked (the avatar's strain categories),
// Garmin's exercise names (Training API Appendix A) so workouts can go to the watch, and whether a
// move loads the legs heavily (kept away from the day before key bike/run sessions). Pure.

export type Load = "weight" | "bodyweight" | "band";
export type Exercise = {
  slug: string;
  name: string;
  category: string; // strain category (lib/avatar/strain.ts) for the muscle map
  garmin: { category: string; name: string | null };
  load: Load;
  legs: boolean; // a lower-body move
  heavy: boolean; // a big lower-body lift (not before key bike/run days)
  perSide: boolean;
  hold: boolean; // done for time, not reps
  cue: string;
};

export const EXERCISES: Exercise[] = [
  // Lower body
  { slug: "back-squat", name: "Back squat", category: "squat", garmin: { category: "SQUAT", name: "BARBELL_BACK_SQUAT" }, load: "weight", legs: true, heavy: true, perSide: false, hold: false, cue: "Brace, sit between the hips, knees track over toes, drive up through mid-foot." },
  { slug: "goblet-squat", name: "Goblet squat", category: "squat", garmin: { category: "SQUAT", name: "GOBLET_SQUAT" }, load: "weight", legs: true, heavy: false, perSide: false, hold: false, cue: "Weight at the chest, elbows inside the knees at the bottom, tall torso." },
  { slug: "split-squat", name: "Bulgarian split squat", category: "lunge", garmin: { category: "LUNGE", name: "DUMBBELL_BULGARIAN_SPLIT_SQUAT" }, load: "weight", legs: true, heavy: true, perSide: true, hold: false, cue: "Back foot on a bench, drop straight down, front knee over the foot." },
  { slug: "reverse-lunge", name: "Reverse lunge", category: "lunge", garmin: { category: "LUNGE", name: "DUMBBELL_REVERSE_LUNGE" }, load: "weight", legs: true, heavy: false, perSide: true, hold: false, cue: "Step back, back knee just above the floor, push through the front heel." },
  { slug: "lateral-lunge", name: "Lateral lunge", category: "lunge", garmin: { category: "LUNGE", name: "DUMBBELL_SIDE_LUNGE" }, load: "weight", legs: true, heavy: false, perSide: true, hold: false, cue: "Wide step to the side, sit back into that hip, other leg straight." },
  { slug: "step-up", name: "Step-up", category: "squat", garmin: { category: "SQUAT", name: "DUMBBELL_STEP_UP" }, load: "weight", legs: true, heavy: false, perSide: true, hold: false, cue: "Whole foot on the box, drive up without pushing off the back leg." },
  { slug: "deadlift", name: "Deadlift", category: "deadlift", garmin: { category: "DEADLIFT", name: "BARBELL_DEADLIFT" }, load: "weight", legs: true, heavy: true, perSide: false, hold: false, cue: "Bar over mid-foot, flat back, push the floor away, hips and shoulders rise together." },
  { slug: "rdl", name: "Romanian deadlift", category: "deadlift", garmin: { category: "DEADLIFT", name: "ROMANIAN_DEADLIFT" }, load: "weight", legs: true, heavy: true, perSide: false, hold: false, cue: "Soft knees, hips back until the hamstrings stretch, flat back, stand tall." },
  { slug: "single-leg-rdl", name: "Single-leg RDL", category: "deadlift", garmin: { category: "DEADLIFT", name: "SINGLE_LEG_ROMANIAN_DEADLIFT_WITH_DUMBBELL" }, load: "weight", legs: true, heavy: false, perSide: true, hold: false, cue: "Hinge on one leg, hips square, back leg and torso move as one." },
  { slug: "hip-thrust", name: "Hip thrust", category: "hip_raise", garmin: { category: "HIP_RAISE", name: "BARBELL_HIP_THRUST_WITH_BENCH" }, load: "weight", legs: true, heavy: true, perSide: false, hold: false, cue: "Upper back on a bench, chin tucked, drive hips up and squeeze, ribs down." },
  { slug: "glute-bridge", name: "Glute bridge", category: "hip_raise", garmin: { category: "HIP_RAISE", name: "HIP_RAISE" }, load: "bodyweight", legs: true, heavy: false, perSide: false, hold: false, cue: "Feet close, press through the heels, squeeze the glutes at the top." },
  { slug: "single-leg-bridge", name: "Single-leg glute bridge", category: "hip_raise", garmin: { category: "HIP_RAISE", name: "SINGLE_LEG_HIP_RAISE" }, load: "bodyweight", legs: true, heavy: false, perSide: true, hold: false, cue: "One foot down, hips level, lift and hold a second at the top." },
  { slug: "calf-raise", name: "Standing calf raise", category: "calf_raise", garmin: { category: "CALF_RAISE", name: "STANDING_CALF_RAISE" }, load: "weight", legs: true, heavy: false, perSide: false, hold: false, cue: "Full range: heels below the step, rise high, slow down." },
  { slug: "single-leg-calf-raise", name: "Single-leg calf raise", category: "calf_raise", garmin: { category: "CALF_RAISE", name: "SINGLE_LEG_STANDING_CALF_RAISE" }, load: "bodyweight", legs: true, heavy: false, perSide: true, hold: false, cue: "One foot on a step, straight knee, slow three-second lower." },
  { slug: "seated-calf-raise", name: "Bent-knee calf raise", category: "calf_raise", garmin: { category: "CALF_RAISE", name: "SEATED_CALF_RAISE" }, load: "weight", legs: true, heavy: false, perSide: false, hold: false, cue: "Knees bent to work the soleus; full range, controlled." },
  { slug: "nordic-curl", name: "Nordic hamstring curl", category: "leg_curl", garmin: { category: "LEG_CURL", name: null }, load: "bodyweight", legs: true, heavy: false, perSide: false, hold: false, cue: "Ankles anchored, lower slowly from the knees with a straight line hips to head." },
  { slug: "copenhagen", name: "Copenhagen plank", category: "hip_stability", garmin: { category: "HIP_STABILITY", name: null }, load: "bodyweight", legs: true, heavy: false, perSide: true, hold: true, cue: "Side plank with the top leg on a bench, lift the bottom leg, hold steady." },
  { slug: "band-walk", name: "Band lateral walk", category: "hip_stability", garmin: { category: "HIP_STABILITY", name: "LATERAL_WALKS_WITH_BAND_AT_ANKLES" }, load: "band", legs: true, heavy: false, perSide: false, hold: false, cue: "Band at the ankles, slight squat, small steps, toes forward." },
  { slug: "clamshell", name: "Clamshell", category: "hip_stability", garmin: { category: "BANDED_EXERCISES", name: "CLAM_SHELLS" }, load: "band", legs: true, heavy: false, perSide: true, hold: false, cue: "On your side, knees bent, open the top knee without rolling the hips back." },
  { slug: "box-jump", name: "Box jump", category: "plyo", garmin: { category: "PLYO", name: "BOX_JUMP" }, load: "bodyweight", legs: true, heavy: false, perSide: false, hold: false, cue: "Quick dip, explode up, land softly, step down." },
  { slug: "squat-jump", name: "Squat jump", category: "plyo", garmin: { category: "PLYO", name: "SQUAT_JUMPS_IN_AND_OUT" }, load: "bodyweight", legs: true, heavy: false, perSide: false, hold: false, cue: "Fast and tall, land quietly, reset before the next." },
  { slug: "leg-press", name: "Leg press", category: "squat", garmin: { category: "SQUAT", name: "LEG_PRESS" }, load: "weight", legs: true, heavy: true, perSide: false, hold: false, cue: "Feet hip-width, lower until the hips stay down, press without locking out." },
  // Core
  { slug: "plank", name: "Plank", category: "plank", garmin: { category: "PLANK", name: "PLANK" }, load: "bodyweight", legs: false, heavy: false, perSide: false, hold: true, cue: "Forearms down, straight line, squeeze glutes, breathe." },
  { slug: "side-plank", name: "Side plank", category: "plank", garmin: { category: "PLANK", name: "SIDE_PLANK" }, load: "bodyweight", legs: false, heavy: false, perSide: true, hold: true, cue: "Elbow under the shoulder, hips high, body in one line." },
  { slug: "dead-bug", name: "Dead bug", category: "core", garmin: { category: "HIP_STABILITY", name: "DEAD_BUG" }, load: "bodyweight", legs: false, heavy: false, perSide: false, hold: false, cue: "Low back pressed down, extend opposite arm and leg slowly." },
  { slug: "bird-dog", name: "Bird dog", category: "core", garmin: { category: "CORE", name: null }, load: "bodyweight", legs: false, heavy: false, perSide: true, hold: false, cue: "On all fours, reach opposite arm and leg long without the hips tilting." },
  { slug: "pallof-press", name: "Pallof press", category: "chop", garmin: { category: "CHOP", name: null }, load: "band", legs: false, heavy: false, perSide: true, hold: false, cue: "Band at chest height to the side, press straight out and resist the twist." },
  { slug: "woodchop", name: "Cable woodchop", category: "chop", garmin: { category: "CHOP", name: "CABLE_WOODCHOP" }, load: "weight", legs: false, heavy: false, perSide: true, hold: false, cue: "Rotate from the hips and trunk, arms long, controlled return." },
  { slug: "back-extension", name: "Back extension", category: "core", garmin: { category: "HYPEREXTENSION", name: "BACK_EXTENSION_WITH_OPPOSITE_ARM_AND_LEG_REACH" }, load: "bodyweight", legs: false, heavy: false, perSide: false, hold: false, cue: "Lift chest and opposite leg a little, long neck, slow." },
  { slug: "farmer-carry", name: "Farmer carry", category: "carry", garmin: { category: "CARRY", name: "FARMERS_CARRY" }, load: "weight", legs: false, heavy: false, perSide: false, hold: true, cue: "Heavy weights at your sides, tall, short quick steps." },
  // Upper body
  { slug: "push-up", name: "Push-up", category: "push_up", garmin: { category: "PUSH_UP", name: "PUSH_UP" }, load: "bodyweight", legs: false, heavy: false, perSide: false, hold: false, cue: "Hands under shoulders, body straight, chest to a fist from the floor." },
  { slug: "db-bench", name: "Dumbbell bench press", category: "bench_press", garmin: { category: "BENCH_PRESS", name: "DUMBBELL_BENCH_PRESS" }, load: "weight", legs: false, heavy: false, perSide: false, hold: false, cue: "Shoulder blades back, elbows about 45°, press up and slightly in." },
  { slug: "db-press", name: "Dumbbell shoulder press", category: "shoulder_press", garmin: { category: "SHOULDER_PRESS", name: "DUMBBELL_SHOULDER_PRESS" }, load: "weight", legs: false, heavy: false, perSide: false, hold: false, cue: "Ribs down, press overhead without arching." },
  { slug: "one-arm-row", name: "One-arm dumbbell row", category: "row", garmin: { category: "ROW", name: "ONE_ARM_BENT_OVER_ROW" }, load: "weight", legs: false, heavy: false, perSide: true, hold: false, cue: "Hand on a bench, pull the elbow to the hip, no twisting." },
  { slug: "inverted-row", name: "Inverted row", category: "row", garmin: { category: "ROW", name: "INVERTED_ROW" }, load: "bodyweight", legs: false, heavy: false, perSide: false, hold: false, cue: "Body straight under a bar, chest to the bar, squeeze shoulder blades." },
  { slug: "pull-up", name: "Pull-up", category: "pull_up", garmin: { category: "PULL_UP", name: "PULL_UP" }, load: "bodyweight", legs: false, heavy: false, perSide: false, hold: false, cue: "Full hang, pull chest toward the bar, control down." },
  { slug: "lat-pulldown", name: "Lat pulldown", category: "pull_up", garmin: { category: "PULL_UP", name: "LAT_PULLDOWN" }, load: "weight", legs: false, heavy: false, perSide: false, hold: false, cue: "Lean back slightly, pull the bar to the upper chest, elbows down." },
  { slug: "face-pull", name: "Face pull", category: "row", garmin: { category: "ROW", name: "FACE_PULL" }, load: "band", legs: false, heavy: false, perSide: false, hold: false, cue: "Pull the rope toward the eyes, elbows high, thumbs back." },
  { slug: "russian-twist", name: "Russian twist", category: "core", garmin: { category: "CORE", name: "RUSSIAN_TWIST" }, load: "weight", legs: false, heavy: false, perSide: false, hold: false, cue: "Lean back, tall chest, rotate the shoulders side to side." },
];

export const BY_SLUG = new Map(EXERCISES.map((e) => [e.slug, e]));
