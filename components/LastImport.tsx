type Row = { status: string; range: string; counts: Record<string, number> | null; created_at: string; error: string | null };

/** One line about the most recent history import, if any. */
export default function LastImport({ row }: { row: Row | null }) {
  if (!row) return null;
  const when = new Date(row.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  const c = row.counts ?? {};
  const text =
    row.status === "done"
      ? `Last import ${when}: ${(c.wellness_days ?? 0).toLocaleString()} days, ${(c.activities ?? 0).toLocaleString()} activities (${row.range === "all" ? "all history" : "last 12 months"}).`
      : row.status === "failed"
        ? `Last import ${when} didn't finish${row.error ? `: ${row.error}` : "."}`
        : `An import started ${when} and hasn't finished.`;
  return <p className={`text-sm ${row.status === "failed" ? "text-amber-200/80" : "text-white/55"}`}>{text}</p>;
}
