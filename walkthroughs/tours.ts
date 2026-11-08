// The scripted walkthroughs: what to tap and what each caption says. Re-record after design changes:
//   node walkthroughs/record.ts athlete   (or coach)   →   node walkthroughs/edit.ts athlete
// Steps never save, send or delete anything, so demo accounts stay as they are. A step whose button
// moved is skipped with a warning instead of failing the whole recording.
import type { Tour } from "./record.ts";

export const TOURS: Record<"athlete" | "coach", { title: string; run: (t: Tour) => Promise<void> }> = {
  athlete: {
    title: "A tour of Diastole",
    run: async (t) => {
      await t.segment("athlete-today", async () => {
        await t.go("/me");
        await t.caption("Today: your plan, readiness and anything that needs you.", 3200);
        await t.scroll(500);
        await t.caption("Recovery ideas show up when they're useful.", 2800);
        await t.scroll(-500);
      });
      await t.segment("athlete-life", async () => {
        await t.tap(t.page.getByRole("button", { name: "Life happened?" }));
        await t.caption("Life happened? Say what's up.", 2600);
        await t.tap(t.page.getByRole("button", { name: /little time/ }));
        await t.caption("Small changes happen right away. Bigger ones go to your coach.", 3200);
        await t.page.keyboard.press("Escape");
      });
      await t.segment("athlete-recovery", async () => {
        await t.go("/recovery");
        await t.caption("Recovery routines with your coach's demo videos.", 2600);
        await t.tap(t.page.getByRole("link", { name: /Calf and soleus/ }).first());
        await t.tap(t.page.getByRole("button", { name: "Start" }));
        await t.caption("Follow along: timer, side switches and spoken cues.", 4200);
        await t.tap(t.page.getByRole("button", { name: "Close" }));
      });
      await t.segment("athlete-mine", async () => {
        await t.go("/training/mine");
        await t.caption("Build your own workouts or import a set.", 3000);
        await t.caption("Then ask your coach to add one to your calendar.", 2800);
      });
    },
  },
  coach: {
    title: "Coaching with Diastole",
    run: async (t) => {
      await t.segment("coach-today", async () => {
        await t.go("/dashboard");
        await t.caption("Your coaching day: flags, requests and plan changes in one place.", 3400);
        await t.scroll(600);
        await t.scroll(-600);
      });
      await t.segment("coach-change", async () => {
        const box = t.page.getByRole("textbox", { name: "What's changing?" });
        await t.tap(box);
        await t.type(box, "easy long run instead of the bike today");
        await t.caption("Say what's changing in a sentence…", 2400);
        await t.caption("…then approve the swap in one tap. Calendar and watch update.", 3200);
        await box.fill("");
      });
      await t.segment("coach-recovery", async () => {
        await t.go("/lab/recovery");
        await t.caption("Build recovery routines from your demo moves.", 2600);
        await t.tap(t.page.getByRole("button", { name: "New routine" }));
        await t.tap(t.page.getByRole("button", { name: /Foam roll calves/ }).first());
        await t.tap(t.page.getByRole("button", { name: /Wall calf stretch, straight/ }).first());
        await t.caption("Set the times, save, and assign it like a workout.", 3200);
      });
    },
  },
};
