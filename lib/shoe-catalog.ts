import type { ShoeKind } from "@/lib/closet";

import { catalogLabel, searchCatalog } from "./catalog-search.ts";

// Running shoe models by brand, for the closet search. Model families without version numbers so
// the list doesn't go stale; athletes add the version ("Pegasus 41") after picking. Anything not
// here can still be typed in by hand.

export const SHOE_BRANDS = ["Nike", "On", "Saucony", "Craft", "Hoka", "Brooks", "Altra"] as const;
export type ShoeBrand = (typeof SHOE_BRANDS)[number];
export type CatalogShoe = { brand: ShoeBrand; model: string; kind: ShoeKind };

const C: Record<ShoeBrand, Partial<Record<ShoeKind, string[]>>> = {
  Nike: {
    daily: ["Pegasus", "Pegasus Plus", "Pegasus Premium", "Vomero", "Vomero Plus", "Vomero Premium", "Structure", "Structure Plus", "Invincible", "InfinityRN", "Interact Run", "Winflo", "Journey Run", "Downshifter", "Revolution", "Quest"],
    speed: ["Zoom Fly", "Rival Fly", "Pegasus Turbo"],
    race: ["Vaporfly", "Alphafly", "Vaporfly Next%"],
    track: ["Streakfly"],
    spikes: ["Dragonfly", "Dragonfly XC", "Victory", "Maxfly", "Superfly Elite", "Rival Distance", "Rival Sprint", "Rival Multi", "Rival XC", "Rival Jump", "Zoom Ja Fly"],
    trail: ["Pegasus Trail", "Zegama", "Ultrafly", "Wildhorse", "Kiger", "Juniper Trail", "Vomero Trail"],
  },
  On: {
    daily: ["Cloud", "Cloud X", "Cloudmonster", "Cloudsurfer", "Cloudsurfer Max", "Cloudsurfer Next", "Cloudrunner", "Cloudeclipse", "Cloudstratus", "Cloudgo", "Cloudflyer", "Cloudspark", "Cloudnova Flux"],
    speed: ["Cloudmonster Hyper", "Cloudflow", "Cloudboom Zone", "Cloudboom Max"],
    race: ["Cloudboom Echo", "Cloudboom Strike", "Cloudboom Strike LS"],
    spikes: ["Cloudspike 10000m", "Cloudspike 1500m"],
    trail: ["Cloudultra", "Cloudultra Pro", "Cloudvista", "Cloudsurfer Trail", "Cloudventure", "Cloudventure Peak", "Cloudhorizon"],
  },
  Saucony: {
    daily: ["Ride", "Guide", "Triumph", "Hurricane", "Axon", "Tempus", "Echelon", "Endorphin Shift", "Endorphin Trainer", "Omni", "Cohesion"],
    speed: ["Endorphin Speed", "Kinvara", "Freedom", "Endorphin Azura"],
    race: ["Endorphin Pro", "Endorphin Elite"],
    track: ["Sinister", "Type A"],
    spikes: ["Endorphin Cheetah", "Terminal VT", "Ballista MD", "Kilkenny XC", "Havok XC", "Showdown", "Spitfire", "Velocity MP", "Uplift"],
    trail: ["Peregrine", "Xodus Ultra", "Endorphin Edge", "Endorphin Rift", "Blaze TR", "Ride TR", "Hurricane TR"],
  },
  Craft: {
    daily: ["CTM Ultra", "Endurance", "Pacer", "Xplor Hybrid"],
    speed: ["Pro Endur Distance", "Nordlite Speed"],
    race: ["CTM Ultra Carbon"],
    trail: ["Nordlite Ultra", "Endurance Trail", "Pure Trail", "Ultra Carbon Trail", "Xplor"],
  },
  Hoka: {
    daily: ["Clifton", "Bondi", "Arahi", "Gaviota", "Skyward X", "Skyflow", "Kawana", "Solimar", "Transport", "Rincon"],
    speed: ["Mach", "Mach X"],
    race: ["Rocket X", "Cielo X1", "Carbon X"],
    track: ["Cielo Road"],
    spikes: ["Cielo X 2 MD", "Cielo X 2 LD", "Cielo X LD", "Crescendo MD", "Crescendo XC", "Cielo FLYX", "Rocket LD"],
    trail: ["Speedgoat", "Challenger ATR", "Tecton X", "Torrent", "Zinal", "Stinson ATR", "Mafate Speed", "Mafate X", "Mafate"],
  },
  Brooks: {
    daily: ["Ghost", "Ghost Max", "Glycerin", "Glycerin Max", "Glycerin GTS", "Adrenaline GTS", "Revel", "Levitate", "Trace", "Ariel", "Beast", "Addiction"],
    speed: ["Launch", "Hyperion Max", "Hyperion Tempo", "Hyperion GTS"],
    race: ["Hyperion Elite"],
    track: ["Hyperion"],
    spikes: ["ELMN8", "Draft XC", "Mach 19", "Wire", "QW-K", "Hyperion Elite LD", "Hyperion Elite MD"],
    trail: ["Catamount", "Cascadia", "Caldera", "Divide"],
  },
  Altra: {
    daily: ["Torin", "Escalante", "Rivera", "Paradigm", "Provision", "Via Olympus", "Experience Flow", "Experience Form", "FWD Via"],
    speed: ["Vanish Tempo"],
    race: ["Vanish Carbon"],
    track: ["Escalante Racer"],
    trail: ["Lone Peak", "Olympus", "Timp", "Mont Blanc", "Superior", "Outroad", "King MT", "Experience Wild", "Mont Blanc Carbon"],
  },
};

export const SHOE_CATALOG: CatalogShoe[] = SHOE_BRANDS.flatMap((brand) =>
  Object.entries(C[brand]).flatMap(([kind, models]) => (models ?? []).map((model) => ({ brand, model, kind: kind as ShoeKind }))),
);

export const searchShoes = (q: string, limit = 8) => searchCatalog(SHOE_CATALOG, q, limit);
export { catalogLabel };
