// Documentation captures — PSP-native framebuffers, straight from the app.
//
// The README and the pocketjs.dev post both claim their screenshots are the
// executable's own output rather than a mockup, so they come from here: the
// real guest bundle and pak, booted against PocketJS's wasm core at raster
// density 1 (480x272, the PSP's panel), driven through the same
// button-mask/analog frame contract the native host uses. Same machinery as
// test/golden.ts, which byte-compares the density-2 Vita journeys.
//
// Every shot stays at a low zoom on the Components page: the file's wireframe
// artboards, which is what a document viewer should be judged on. The kit's
// cover art is deliberately not captured.
//
//   bun tools/capture-shots.ts            # writes docs/*.png

import { mkdirSync, writeFileSync } from "node:fs";
import { createWasmUi } from "../vendor/pocketjs/hosts/web/wasm-ops.js";
import { BTN, SCREEN_H, SCREEN_W } from "../vendor/pocketjs/contracts/spec/spec.ts";
import { encodePNG } from "../vendor/pocketjs/tests/png.ts";
import { compilePocketTarget } from "../scripts/pocket-plan.ts";

const ROOT = new URL("..", import.meta.url).pathname;
const DIST = `${ROOT}dist/`;
const WASM = `${ROOT}vendor/pocketjs/hosts/web/pocketjs.wasm`;
const DOCS = `${ROOT}docs/`;
const DENSITY = 1;
const ANALOG_CENTER = 0x8080;

interface Shot {
  /** Output name, written as docs/<name>.png. */
  readonly name: string;
  readonly frames: number;
  readonly input?: (frame: number) => { buttons?: number; analog?: number };
}

// TRIANGLE switches to the Components page; the viewer fits the new page, so
// holding no further input leaves the whole artboard row on screen. R zooms in
// from there, one wireframe cluster at a time.
const SHOTS: readonly Shot[] = [
  {
    name: "figma-psp-components-fit",
    frames: 72,
    input: (frame) => (frame === 16 ? { buttons: BTN.TRIANGLE } : {}),
  },
  {
    // Hold R for just over a second to reach 24%, then walk the nub up the
    // canvas until the component artboards sit under the HUD.
    name: "figma-psp-components-zoom",
    frames: 182,
    input: (frame) => {
      if (frame === 16) return { buttons: BTN.TRIANGLE };
      if (frame >= 48 && frame < 112) return { buttons: BTN.RTRIGGER };
      if (frame >= 116 && frame < 162) return { analog: 0x8000 };
      return {};
    },
  },
];

async function render(shot: Shot, wasmBytes: ArrayBuffer, js: string, pak: ArrayBuffer) {
  const wasm = await createWasmUi(wasmBytes);
  wasm.init(DENSITY);
  const globals = globalThis as Record<string, unknown>;
  globals.ui = wasm.ops;
  globals.__pak = pak;
  globals.frame = undefined;
  try {
    (0, eval)(js);
    const frame = globals.frame as
      ((buttons: number, analog?: number, touches?: readonly number[]) => void) | undefined;
    if (typeof frame !== "function") throw new Error("bundle did not install globalThis.frame");
    for (let index = 0; index < shot.frames; index++) {
      const input = shot.input?.(index) ?? {};
      frame(input.buttons ?? 0, input.analog ?? ANALOG_CENTER);
      wasm.tick();
    }
    return wasm.renderScaled(DENSITY).slice();
  } finally {
    delete globals.ui;
    delete globals.__pak;
    globals.frame = undefined;
  }
}

// Rebuild both halves for the same reason the golden does: a stale bundle or
// core would quietly publish a screenshot of code nobody is running.
await compilePocketTarget("psp");
const wasmBuild = Bun.spawnSync(["bun", "vendor/pocketjs/tools/wasm.ts"], {
  cwd: ROOT,
  stdout: "inherit",
  stderr: "inherit",
});
if (wasmBuild.exitCode !== 0) throw new Error("wasm build failed");
mkdirSync(DOCS, { recursive: true });

const wasmBytes = await Bun.file(WASM).arrayBuffer();
const js = await Bun.file(`${DIST}pocket-figma.js`).text();
const pak = await Bun.file(`${DIST}pocket-figma.pak`).arrayBuffer();

for (const shot of SHOTS) {
  const rgba = await render(shot, wasmBytes, js, pak);
  writeFileSync(`${DOCS}${shot.name}.png`, encodePNG(rgba, SCREEN_W, SCREEN_H));
  console.log(`WROTE docs/${shot.name}.png (${SCREEN_W}x${SCREEN_H})`);
}
