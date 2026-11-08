// Walkthrough videos recorded by walkthroughs/record.ts and edited by walkthroughs/edit.ts, then
// uploaded to the public "media" bucket (walkthroughs/upload.ts). The Help page shows whichever exist.

export type Walkthrough = { id: string; title: string; role: "athlete" | "coach"; kind: "tour" | "clip"; file: string };

export const WALKTHROUGHS: Walkthrough[] = [
  { id: "athlete-tour", title: "A tour of Diastole", role: "athlete", kind: "tour", file: "walkthroughs/athlete-tour.mp4" },
  { id: "coach-tour", title: "Coaching with Diastole", role: "coach", kind: "tour", file: "walkthroughs/coach-tour.mp4" },
  { id: "athlete-today", title: "Your Today page", role: "athlete", kind: "clip", file: "walkthroughs/athlete-today.mp4" },
  { id: "athlete-life", title: "Life happened?", role: "athlete", kind: "clip", file: "walkthroughs/athlete-life.mp4" },
  { id: "athlete-recovery", title: "Recovery routines", role: "athlete", kind: "clip", file: "walkthroughs/athlete-recovery.mp4" },
  { id: "athlete-mine", title: "Build your own workouts", role: "athlete", kind: "clip", file: "walkthroughs/athlete-mine.mp4" },
  { id: "coach-today", title: "Your coaching day", role: "coach", kind: "clip", file: "walkthroughs/coach-today.mp4" },
  { id: "coach-change", title: "Change of plans", role: "coach", kind: "clip", file: "walkthroughs/coach-change.mp4" },
  { id: "coach-recovery", title: "Recovery routines", role: "coach", kind: "clip", file: "walkthroughs/coach-recovery.mp4" },
];
