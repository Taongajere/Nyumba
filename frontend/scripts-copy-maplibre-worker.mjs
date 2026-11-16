// Copies MapLibre's Web Worker into public/ so the browser can load it from /maplibre/.
import { copyFileSync, mkdirSync } from "node:fs";

mkdirSync("public/maplibre", { recursive: true });
copyFileSync(
  "node_modules/maplibre-gl/dist/maplibre-gl-worker.mjs",
  "public/maplibre/maplibre-gl-worker.mjs"
);
console.log("Copied MapLibre worker to public/maplibre/");
