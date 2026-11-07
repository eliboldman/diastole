// Splits a coach's coaching document into the shared guide (philosophy, rules, weekly skeleton)
// and one private note per athlete, so one athlete's numbers never reach another's plan.
// Pure module so it can be tested directly with `node`.

export type RosterPerson = { id: string; full_name: string | null };
export type SplitDoc = {
  guide: string;
  athletes: { id: string; name: string; notes: string }[];
  review: string[]; // lines naming more than one athlete: the coach places these by hand
};

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Who a line is about: roster people named in it (first name, or full name when first names repeat). */
function matcher(roster: RosterPerson[]) {
  const people = roster
    .map((p) => ({ id: p.id, full: (p.full_name ?? "").trim(), first: (p.full_name ?? "").trim().split(/\s+/)[0] ?? "" }))
    .filter((p) => p.first.length >= 2);
  const firstCount = new Map<string, number>();
  for (const p of people) firstCount.set(p.first.toLowerCase(), (firstCount.get(p.first.toLowerCase()) ?? 0) + 1);
  const pats = people.map((p) => ({ id: p.id, name: p.full || p.first, re: new RegExp(`\\b${esc(firstCount.get(p.first.toLowerCase())! > 1 ? p.full : p.first)}\\b`, "i") }));
  return (line: string) => pats.filter((p) => p.re.test(line));
}

const tidy = (lines: string[]) => lines.join("\n").replace(/\n{3,}/g, "\n\n").trim();

export function splitCoachingDoc(md: string, roster: RosterPerson[]): SplitDoc {
  const who = matcher(roster);
  const guide: string[] = [];
  const own = new Map<string, { name: string; lines: string[] }>();
  const review: string[] = [];
  const add = (id: string, name: string, line: string) => {
    if (!own.has(id)) own.set(id, { name, lines: [] });
    own.get(id)!.lines.push(line);
  };

  let section: { id: string; name: string; level: number } | null = null; // "### Athlete 1 - Walker ..." until the next heading at that level
  let block: { id: string; name: string } | null = null; // "**Walker (FTP ...)**" until the next blank-line-separated heading

  for (const raw of md.replace(/\r/g, "").split("\n")) {
    const line = raw.replace(/\s+$/, "");
    const heading = /^(#{1,6})\s/.exec(line);
    const named = who(line);

    if (heading) {
      const level = heading[1].length;
      block = null;
      if (section && level <= section.level) section = null;
      if (named.length === 1 && level >= 2) section = { id: named[0].id, name: named[0].name, level };
      if (section) add(section.id, section.name, line);
      else guide.push(line);
      continue;
    }
    if (section) {
      add(section.id, section.name, line);
      continue;
    }
    // Tables are the shared weekly skeleton: they stay in the guide.
    if (line.startsWith("|")) {
      guide.push(line);
      continue;
    }
    if (/^\*\*.+\*\*/.test(line)) block = named.length === 1 ? { id: named[0].id, name: named[0].name } : null;
    if (!line.trim()) {
      block = null;
      guide.push(line);
      continue;
    }
    if (named.length > 1) review.push(line.trim());
    else if (named.length === 1) add(named[0].id, named[0].name, line);
    else if (block) add(block.id, block.name, line);
    else guide.push(line);
  }

  return {
    guide: tidy(guide).slice(0, 20000),
    athletes: [...own.entries()].map(([id, v]) => ({ id, name: v.name, notes: tidy(v.lines).slice(0, 8000) })).filter((a) => a.notes),
    review,
  };
}
