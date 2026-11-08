import type { BikeKind } from "@/lib/closet";

import { searchCatalog } from "./catalog-search.ts";

// Bike models by brand, for the closet search. Model families without years or build levels so the
// list doesn't go stale; anything not here can still be typed in by hand.

export const BIKE_BRANDS = [
  "Giant", "Trek", "Specialized", "Cervélo", "KÚ Cycle", "Ventum", "Canyon", "Bianchi", "Cannondale", "Pinarello",
  "BMC", "Scott", "Felt", "Quintana Roo", "Colnago", "Factor", "Orbea", "Argon 18", "Cube", "Liv",
] as const;
export type BikeBrand = (typeof BIKE_BRANDS)[number];
export type CatalogBike = { brand: BikeBrand; model: string; kind: BikeKind };

const C: Record<BikeBrand, Partial<Record<BikeKind, string[]>>> = {
  Giant: {
    road: ["TCR", "TCR Advanced SL", "TCR Advanced Pro", "Propel", "Propel Advanced SL", "Defy", "Defy Advanced", "Contend"],
    tt: ["Trinity", "Trinity Advanced Pro"],
    gravel: ["Revolt", "Revolt X", "Revolt Advanced"],
    mountain: ["Trance", "Trance X", "Anthem", "Talon", "Fathom", "Reign", "XTC"],
  },
  Trek: {
    road: ["Madone", "Madone SLR", "Madone SL", "Émonda", "Domane", "Domane SLR", "Domane AL"],
    tt: ["Speed Concept", "Speed Concept SLR"],
    gravel: ["Checkpoint", "Checkpoint SLR", "Checkpoint ALR"],
    mountain: ["Fuel EX", "Top Fuel", "Supercaliber", "Procaliber", "Marlin", "Roscoe", "Slash"],
  },
  Specialized: {
    road: ["Tarmac SL8", "Tarmac SL7", "Tarmac", "Aethos", "Allez", "Allez Sprint", "Roubaix", "Venge"],
    tt: ["Shiv", "Shiv TT", "Shiv Disc"],
    gravel: ["Crux", "Diverge", "Diverge STR"],
    mountain: ["Epic", "Epic EVO", "Stumpjumper", "Chisel", "Rockhopper", "Enduro"],
  },
  Cervélo: {
    road: ["S5", "R5", "Soloist", "Caledonia", "Caledonia-5", "R3", "S3"],
    tt: ["P5", "P5X", "P-Series", "PX-Series", "P3", "P2"],
    gravel: ["Áspero", "Áspero-5"],
    mountain: ["ZFS-5"],
  },
  "KÚ Cycle": {
    tt: ["TF1"],
  },
  Ventum: {
    road: ["NS1"],
    tt: ["One", "Tempus"],
    gravel: ["GS1"],
  },
  Canyon: {
    road: ["Aeroad", "Ultimate", "Endurace"],
    tt: ["Speedmax", "Speedmax CFR"],
    gravel: ["Grail", "Grizl"],
    mountain: ["Lux", "Neuron", "Spectral", "Exceed", "Stoic"],
  },
  Bianchi: {
    road: ["Oltre", "Oltre RC", "Specialissima", "Sprint", "Infinito", "Via Nirone 7"],
    tt: ["Aquila"],
    gravel: ["Impulso", "Arcadex"],
    mountain: ["Methanol"],
  },
  Cannondale: {
    road: ["SuperSix EVO", "SystemSix", "Synapse", "CAAD13", "CAAD Optimo"],
    tt: ["SuperSlice"],
    gravel: ["Topstone", "SuperX"],
    mountain: ["Scalpel", "Jekyll", "Habit", "Trail"],
  },
  Pinarello: {
    road: ["Dogma F", "Prince", "Paris", "F9", "F7", "F5"],
    tt: ["Bolide", "Bolide TR"],
    gravel: ["Grevil", "Dogma X"],
  },
  BMC: {
    road: ["Teammachine SLR", "Teammachine R", "Roadmachine", "Timemachine Road"],
    tt: ["Timemachine", "Speedmachine"],
    gravel: ["Kaius", "URS"],
    mountain: ["Fourstroke", "Twostroke"],
  },
  Scott: {
    road: ["Foil RC", "Addict RC", "Addict", "Speedster"],
    tt: ["Plasma"],
    gravel: ["Addict Gravel", "Speedster Gravel"],
    mountain: ["Spark", "Scale", "Genius"],
  },
  Felt: {
    road: ["AR", "FR", "VR"],
    tt: ["IA", "IA 2.0", "B Series"],
    gravel: ["Breed"],
  },
  "Quintana Roo": {
    road: ["SRsix"],
    tt: ["V-PR", "X-PR", "PRsix", "PRfive", "Kilo"],
  },
  Colnago: {
    road: ["V4Rs", "V5Rs", "Y1Rs", "C68", "C64"],
    tt: ["TT1", "K.One"],
    gravel: ["G4-X"],
  },
  Factor: {
    road: ["Ostro VAM", "O2 VAM", "Monza"],
    tt: ["Hanzō", "Slick"],
    gravel: ["Ostro Gravel", "LS"],
  },
  Orbea: {
    road: ["Orca", "Orca Aero", "Avant"],
    tt: ["Ordu"],
    gravel: ["Terra"],
    mountain: ["Oiz", "Occam", "Alma"],
  },
  "Argon 18": {
    road: ["Sum", "Nitrogen", "Gallium", "Krypton"],
    tt: ["E-119 Tri+", "E-117 Tri+"],
    gravel: ["Dark Matter"],
  },
  Cube: {
    road: ["Litening", "Litening Aero", "Attain", "Agree"],
    tt: ["Aerium"],
    gravel: ["Nuroad", "Nuroad C:62"],
    mountain: ["Stereo", "Reaction", "AMS"],
  },
  Liv: {
    road: ["Langma", "Avail", "EnviLiv"],
    gravel: ["Devote"],
    mountain: ["Pique", "Intrigue", "Embolden"],
  },
};

export const BIKE_CATALOG: CatalogBike[] = BIKE_BRANDS.flatMap((brand) =>
  Object.entries(C[brand]).flatMap(([kind, models]) => (models ?? []).map((model) => ({ brand, model, kind: kind as BikeKind }))),
);

export const searchBikes = (q: string, limit = 8) => searchCatalog(BIKE_CATALOG, q, limit);
