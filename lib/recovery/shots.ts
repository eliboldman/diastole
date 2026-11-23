import { TESTS } from "@/lib/mobility/screen";
import { MOVES, SCREEN_CLIPS } from "@/lib/recovery/catalog";

/** Every demo clip the coach films: the 8 screen tests, then each mobility and recovery move. */
export type Shot = { slug: string; name: string; note: string; oneSide: boolean; group: ShotGroup };
export type ShotGroup = "Mobility screen" | "Mobility moves" | "Recovery moves";
export const SHOT_GROUPS: ShotGroup[] = ["Mobility screen", "Mobility moves", "Recovery moves"];

export function shotList(): Shot[] {
  return [
    ...SCREEN_CLIPS.map((c) => {
      const t = TESTS.find((x) => x.clip === c.slug);
      return { slug: c.slug, name: c.name, note: t?.how.join(" ") ?? "", oneSide: t?.sided ?? false, group: "Mobility screen" as const };
    }),
    ...MOVES.filter((m) => !m.pattern).map((m) => ({
      slug: m.slug,
      name: m.name,
      note: m.cue,
      oneSide: m.perSide,
      group: (m.slug.startsWith("mobility-") || m.slug.startsWith("balance-") ? "Mobility moves" : "Recovery moves") as ShotGroup,
    })),
  ];
}
