// Run the viewer in a native window via the vendored uihost (the pocket3d
// workspace's wgpu shell): same bundle + pak as the PSP EBOOT, QuickJS guest,
// pocketjs-core, wgpu renderer.
//
//   bun scripts/desktop.ts                       # window, 2x scale
//   bun scripts/desktop.ts --screenshot out.png  # headless PNG (+ --frames N)
//
// uihost resolves dist/<app>.{js,pak} relative to the POCKETJS checkout by
// default, which is vendor/pocketjs here — so instead of copying artifacts
// in, this script passes our dist/pocket-figma.js + dist/pocket-figma.pak
// EXPLICITLY via
// uihost's --js/--pak flags (--app then only names the window title and the
// eval source label). Extra args are forwarded to uihost verbatim.
//
// Input map (from uihost): arrows = D-pad, Z/Enter = CROSS, A = SQUARE,
// S = TRIANGLE, Q/W = L/R triggers; analog nub I/K/J/L. For this viewer:
// nub/d-pad pan, R/L zoom, TRIANGLE/SQUARE page, CROSS fit.

import { $ } from "bun";
import { compilePocketTarget } from "./pocket-plan.ts";

const repo = new URL("..", import.meta.url).pathname;
const engine = `${repo}vendor/pocketjs/engine/`;

console.log("pocket-figma desktop: building the JS bundle");
const plan = await compilePocketTarget("psp");
const appOutput = plan.appOutput;

const extra = Bun.argv.slice(2);
console.log("pocket-figma desktop: cargo run -p uihost");
await $`cargo run --release -p uihost -- --app pocket-figma --js ${repo}dist/${appOutput}.js --pak ${repo}dist/${appOutput}.pak ${extra}`.cwd(
  engine,
);
