import type { Metadata } from "next";

import AthleteShell from "@/components/AthleteShell";
import IntervalsConnectForm from "@/components/IntervalsConnectForm";
import BackLink from "@/components/layout/BackLink";
import { disconnectIntervals, setSyncFtp, syncIntervalsNow } from "@/lib/intervals/actions";
import { createClient, requireUser } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Zwift & Rouvy · Diastole" };

const card = "rounded-[24px] border border-white/10 bg-white/[0.05] p-5";
const quiet = "min-h-11 text-sm text-white/60 hover:text-white/80";

function when(at: string | null, tz: string) {
  if (!at) return "not yet";
  return new Date(at).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: tz });
}

export default async function IntervalsPage() {
  const me = await requireUser();
  const supabase = await createClient();
  const { data: conn } = await supabase
    .from("intervals_connections")
    .select("icu_athlete_id, icu_name, sync_ftp, connected_at, pushed_at, pulled_at, last_error")
    .eq("athlete_id", me.id)
    .maybeSingle();

  return (
    <AthleteShell isCoach={me.role === "coach"}>
      <BackLink href="/connect" label="Devices" />
      <h1 className="mt-2 text-3xl font-medium tracking-tight">Zwift &amp; Rouvy</h1>
      <p className="mt-2 max-w-xl text-white/60">
        Your coach&apos;s bike workouts show up in Zwift and Rouvy on their day, with the trainer set for you. Diastole sends them through
        intervals.icu (free), which is connected to both. Rides you finish come back to Diastole the same way.
      </p>

      <div className="mt-8 grid max-w-2xl gap-6">
        {conn ? (
          <>
            <section className={card}>
              <p className="font-medium text-emerald-100">Connected{conn.icu_name ? ` as ${conn.icu_name}` : ""}</p>
              <dl className="mt-3 grid gap-1 text-sm text-white/60">
                <div>Workouts sent: {when(conn.pushed_at, me.timezone)}</div>
                <div>Rides checked: {when(conn.pulled_at, me.timezone)}</div>
              </dl>
              {conn.last_error && <p className="mt-3 text-sm text-amber-200">Last problem: {conn.last_error}</p>}
              <div className="mt-4 flex flex-wrap gap-3">
                <form action={syncIntervalsNow}>
                  <button className="inline-flex min-h-11 items-center rounded-2xl border border-emerald-300/25 bg-emerald-300/15 px-4 text-sm font-medium text-emerald-50 hover:bg-emerald-300/25 active:scale-95">
                    Sync now
                  </button>
                </form>
              </div>
            </section>

            <section className={card}>
              <p className="font-medium text-white/85">FTP</p>
              <p className="mt-1 text-sm text-white/60">
                {conn.sync_ftp
                  ? "Diastole keeps your FTP in intervals.icu the same as here, so Zwift and Rouvy set the right watts."
                  : "Diastole leaves your intervals.icu FTP alone. Targets still go as a % of your Diastole FTP."}
              </p>
              <form action={setSyncFtp} className="mt-2">
                <input type="hidden" name="on" value={conn.sync_ftp ? "0" : "1"} />
                <button className={quiet}>{conn.sync_ftp ? "Stop syncing FTP" : "Keep FTP in sync"}</button>
              </form>
            </section>

            <section className={card}>
              <p className="font-medium text-white/85">Check these once in intervals.icu</p>
              <ul className="mt-2 grid list-disc gap-1 pl-5 text-sm text-white/60">
                <li>Settings › Connections: Zwift and/or Rouvy connected.</li>
                <li>In the Zwift connection, &quot;Upload planned workouts&quot; is on.</li>
                <li>Workouts reach Zwift and Rouvy a day or so ahead; pull to refresh in their apps.</li>
              </ul>
            </section>

            <form action={disconnectIntervals} className="flex flex-wrap items-center gap-4">
              <button className={quiet}>Disconnect and remove upcoming workouts</button>
              <button name="keep" value="1" className={quiet}>
                Disconnect, keep them
              </button>
            </form>
          </>
        ) : (
          <>
            <ol className={`${card} grid list-decimal gap-2 pl-10 text-sm text-white/70`}>
              <li>
                Make a free account at{" "}
                <a href="https://intervals.icu" target="_blank" rel="noreferrer" className="text-emerald-200 underline">
                  intervals.icu
                </a>
                .
              </li>
              <li>In intervals.icu, open Settings › Connections and connect Zwift and/or Rouvy.</li>
              <li>Still in Settings, scroll to Developer Settings, make an API key and copy it.</li>
              <li>Paste it below.</li>
            </ol>
            <IntervalsConnectForm />
            <p className="text-sm text-white/45">
              Diastole only adds, updates and removes the bike workouts your coach sends, keeps your FTP in step (you can turn that off)
              and reads rides from Zwift and Rouvy. The key is stored privately and you can disconnect any time.
            </p>
          </>
        )}
      </div>
    </AthleteShell>
  );
}
