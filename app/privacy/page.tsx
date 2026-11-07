import type { Metadata } from "next";
import type { ReactNode } from "react";

import PublicShell from "@/components/PublicShell";
import { SITE } from "@/lib/site";

export const metadata: Metadata = {
  title: `Privacy Policy · ${SITE.name}`,
  description: `How ${SITE.name} collects, uses and protects athlete data.`,
};

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mt-10">
      <h2 className="mb-3 text-lg font-medium text-white">{title}</h2>
      <div className="space-y-3">{children}</div>
    </section>
  );
}

export default function PrivacyPage() {
  const email = (
    <a href={`mailto:${SITE.contactEmail}`} className="text-emerald-200/80 underline-offset-4 hover:underline">
      {SITE.contactEmail}
    </a>
  );

  return (
    <PublicShell>
      <article className="mx-auto max-w-2xl pt-16 text-sm leading-relaxed text-white/60 sm:text-base [&_li]:ml-5 [&_li]:list-disc [&_ul]:space-y-1.5">
        <p className="text-xs uppercase tracking-[0.3em] text-emerald-200/60">Privacy policy</p>
        <h1 className="mt-3 text-3xl font-medium tracking-tight text-white sm:text-4xl">
          How {SITE.name} handles your data
        </h1>
        <p className="mt-3 text-white/55">Effective {SITE.privacyEffectiveDate}</p>

        <Section title="Who we are">
          <p>
            {SITE.name} is a coaching platform operated by {SITE.owner}{" "}(&quot;we&quot;, &quot;us&quot;). It
            helps a coach monitor the recovery and training of the athletes they coach, using data
            from those athletes&apos; wearable devices. {SITE.name} is used only by athletes who have
            been invited by their coach. It is a coaching tool, not a medical device, and it does
            not diagnose or treat any condition.
          </p>
        </Section>

        <Section title="What we collect">
          <p>We only collect data an athlete chooses to connect:</p>
          <ul>
            <li>
              <strong className="text-white/80">Account details:</strong> name and email address.
            </li>
            <li>
              <strong className="text-white/80">From Garmin Connect</strong> (after the athlete
              authorizes access): daily wellness summaries such as heart rate variability (HRV),
              resting heart rate, sleep, stress and Body Battery, and completed activities, including
              the activity file from the watch (heart rate, pace, power, cadence, laps and route over the session).
            </li>
            <li>
              <strong className="text-white/80">From Apple Health</strong> (through our iPhone app,
              after the athlete grants permission): HRV, resting heart rate, sleep and workouts.
            </li>
            <li>
              <strong className="text-white/80">Coaching data:</strong> planned workouts, readiness
              scores we calculate, and notes the coach adds.
            </li>
            <li>
              <strong className="text-white/80">Meals and body weight</strong> (only if the athlete logs
              them): the foods and the carb, protein and fat amounts the athlete confirms, and the body
              weight they enter to size daily targets. Only the athlete and their coach can see these;
              they are never shared with pods. Meal photos are not stored.
            </li>
            <li>
              <strong className="text-white/80">Races and race fueling</strong> (only if added): races and their goals,
              sweat-rate test results (only the resulting rate; the body weights used to work it out are never stored)
              and gut-training notes. Only the athlete and their coach can see these.
            </li>
          </ul>
          <p>
            We collect data from the date an athlete connects onward. For completed outdoor workouts we
            keep the route so the coach can review the session, with the first and last 200 m removed so
            start and finish locations (such as a home address) are never stored. We do not collect
            location history outside workouts, contacts, or any data the athlete has not authorized.
          </p>
        </Section>

        <Section title="How we use it">
          <ul>
            <li>To compare each athlete&apos;s daily metrics to their own baseline and show a readiness summary.</li>
            <li>To let the athlete&apos;s coach view their recovery and training and plan workouts.</li>
            <li>
              To send structured workouts to the athlete&apos;s Garmin device or Apple Watch, only
              when the coach chooses to.
            </li>
          </ul>
          <p>
            The coach may use an AI assistant (Claude, provided by Anthropic) to summarize athlete
            data, including running-form measurements like cadence and ground contact time, and to
            suggest training adjustments or drills. Suggestions are reviewed by the coach before
            anything is changed or sent to an athlete. Routes and location are never sent.
          </p>
          <p>
            When an athlete logs a meal, the photo and any description they add are sent to Claude to
            estimate the foods and amounts, shown back to the athlete to confirm. The photo is shrunk on
            the athlete&apos;s phone first, used only for that estimate, and never saved by Diastole.
          </p>
        </Section>

        <Section title="What we never do">
          <ul>
            <li>We never sell personal or health data.</li>
            <li>We never use health data for advertising or marketing.</li>
            <li>
              We never share Apple Health data with third parties except as needed to run the
              service, in line with Apple&apos;s HealthKit rules.
            </li>
          </ul>
        </Section>

        <Section title="Who can see your data">
          <p>
            You and your coach. Each athlete can see only their own data, with one exception you
            control: pods.
          </p>
          <p>
            <strong className="text-white/80">Pods:</strong> your coach may invite you to a pod, a
            small group of athletes who see each other&apos;s training. Nothing is shared unless you
            accept the invite. Once you accept, other members who have also accepted can see your
            readiness flag and note, your HRV, resting heart rate, sleep and stress for the last 14
            days, and a summary of your recent activities. They see your name, not your email. Full
            workout details (charts, laps, zones and route) are shared only if you turn on &ldquo;Share
            workout details&rdquo;, and only with pod members who have turned it on too; it is off by
            default. You can leave a pod or turn sharing off at any time, and sharing stops immediately.
          </p>
          <p>
            <strong className="text-white/80">Messages:</strong> messages between you and your coach,
            including photos and voice notes, are seen only by the two of you. Messages in a pod chat,
            and props, stickers and comments on workouts in a pod&apos;s feed, are seen by that
            pod&apos;s coach and its current members. Photos and voice notes are stored privately and
            shown only through short-lived links. You can delete a message you sent; it is removed
            for everyone, along with its photo or voice note.
          </p>
          <p> We use a small
            number of service providers to run {SITE.name}, who process data on our behalf and
            may not use it for anything else:
          </p>
          <ul>
            <li>Supabase: secure database, account sign-in, and private storage for message photos and voice notes.</li>
            <li>Vercel: website hosting.</li>
            <li>OpenFreeMap: map images behind workout routes. Your browser requests the map area being viewed; the route itself is drawn in your browser and never sent to them.</li>
            <li>Anthropic: AI summaries for the coach and meal estimates for athletes, as described above.</li>
            <li>Open Food Facts: when you scan a barcode, only the barcode number is sent to look up the product&apos;s nutrition.</li>
            <li>Apple: push notifications to the Diastole iPhone app, if you allow them. Apple receives the notification&apos;s title and text to deliver it to your phone.</li>
          </ul>
          <p>We may disclose data if required by law.</p>
        </Section>

        <Section title="How we protect it">
          <p>
            Data is encrypted in transit and stored in a database with access rules that limit
            each person to the data they are allowed to see. No system is perfectly secure, but we
            keep access limited to what the service needs.
          </p>
        </Section>

        <Section title="Your choices">
          <ul>
            <li>
              <strong className="text-white/80">Disconnect anytime:</strong> remove {SITE.name}&apos;s
              access in Garmin Connect, or turn off its permissions in the iPhone Health settings.
              We stop receiving new data immediately.
            </li>
            <li>
              <strong className="text-white/80">Delete your data:</strong> email {email} and we
              will delete your account and all associated data within 30 days.
            </li>
            <li>
              <strong className="text-white/80">Access a copy:</strong> email us and we will send
              you the data we hold about you.
            </li>
          </ul>
          <p>
            When an athlete disconnects Garmin, we delete the Garmin connection and stop all
            further data collection from that account.
          </p>
        </Section>

        <Section title="Young athletes">
          <p>
            {SITE.name} is not intended for children under 13. Athletes under 18 may use it only
            with the consent of a parent or guardian.
          </p>
        </Section>

        <Section title="Changes">
          <p>
            If we change this policy, we will update the date above and let athletes know about
            any significant change.
          </p>
        </Section>

        <Section title="Contact">
          <p>Questions or requests: {email}.</p>
        </Section>
      </article>
    </PublicShell>
  );
}
