import type { CoachNote } from "@/types/note";

type Props = {
  notes: CoachNote[];
};

export default function CoachNotes({
  notes,
}: Props) {
  return (
    <section className="mt-8 rounded-[36px] border border-white/10 bg-white/[0.035] p-7 backdrop-blur-2xl">
      <div>
        <p className="text-sm uppercase tracking-[0.2em] text-white/35">
          Coach Notes
        </p>

        <h2 className="mt-2 text-3xl font-semibold tracking-tight">
          Intervention History
        </h2>
      </div>

      <div className="mt-8 space-y-4">
        {notes.length === 0 && (
          <div className="rounded-3xl border border-white/10 bg-[#0b0b0b]/90 p-5 text-white/45">
            No intervention history available.
          </div>
        )}

        {notes.map((note) => (
          <NoteCard key={note.id} note={note} />
        ))}
      </div>
    </section>
  );
}

function NoteCard({
  note,
}: {
  note: CoachNote;
}) {
  const severityGlow =
    note.severity === "high"
      ? "border-rose-400/15 shadow-[0_0_28px_rgba(251,113,133,0.10)]"
      : note.severity === "moderate"
        ? "border-orange-300/15 shadow-[0_0_32px_rgba(253,186,116,0.10)]"
        : "border-emerald-400/10 shadow-[0_0_24px_rgba(74,222,128,0.08)]";

  const originColor =
    note.origin === "coach"
      ? "text-blue-300"
      : note.origin === "ai"
        ? "text-violet-300"
        : "text-orange-300";

  return (
    <div
      className={`rounded-3xl border bg-[#0b0b0b]/90 p-5 ${severityGlow}`}
    >
      <div className="flex items-start justify-between gap-6">
        <div>
          <div className="flex items-center gap-3">
            <h3 className="text-xl font-semibold text-white/85">
              {note.title}
            </h3>

            <span
              className={`rounded-full border border-white/10 px-2 py-1 text-[10px] uppercase tracking-[0.18em] ${originColor}`}
            >
              {note.origin}
            </span>
          </div>

          <p className="mt-3 leading-relaxed text-white/55">
            {note.body}
          </p>
        </div>

        <p className="shrink-0 text-sm text-white/35">
          {note.time}
        </p>
      </div>
    </div>
  );
}