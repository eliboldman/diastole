// MapLibre runs map work in a web worker that the Next bundler doesn't pick up, so the worker
// file is copied to public/ (served as a same-origin static file) before dev and build.
import { copyFileSync, mkdirSync, readFileSync } from "node:fs";

const { version } = JSON.parse(readFileSync(new URL("../node_modules/maplibre-gl/package.json", import.meta.url), "utf8"));
const out = new URL("../public/vendor/", import.meta.url);
mkdirSync(out, { recursive: true });
copyFileSync(new URL("../node_modules/maplibre-gl/dist/maplibre-gl-worker.mjs", import.meta.url), new URL("maplibre-gl-worker.mjs", out));
console.log(`maplibre worker ${version} copied to public/vendor/`);
