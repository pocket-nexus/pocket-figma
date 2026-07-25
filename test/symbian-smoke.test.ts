import { expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

const root = new URL("..", import.meta.url).pathname;
const pocketJsRoot = resolve(
  process.env.POCKETJS_ROOT ?? resolve(root, "vendor/pocketjs"),
);
const outputRoot = resolve(root, "dist/symbian/guest");
const bundlePath = resolve(outputRoot, "pocket-figma.js");
const packPath = resolve(outputRoot, "pocket-figma.pak");
const wasmPath = resolve(pocketJsRoot, "hosts/web/pocketjs.wasm");
const wasmOpsPath = resolve(pocketJsRoot, "hosts/web/wasm-ops.js");
const specPath = resolve(pocketJsRoot, "contracts/spec/spec.ts");
const wasmToolPath = resolve(pocketJsRoot, "tools/wasm.ts");

for (const required of [wasmOpsPath, specPath, wasmToolPath]) {
  if (!existsSync(required)) {
    throw new Error(
      `PocketJS HostOps smoke input is unavailable: ${required}; ` +
        "set POCKETJS_ROOT to the current PocketJS checkout",
    );
  }
}

const wasmBuild = Bun.spawnSync(["bun", wasmToolPath], {
  cwd: pocketJsRoot,
  env: process.env,
  stdout: "inherit",
  stderr: "inherit",
});
if (wasmBuild.exitCode !== 0 || !existsSync(wasmPath)) {
  throw new Error(
    `PocketJS WASM host build failed with exit code ${wasmBuild.exitCode}`,
  );
}

const build = Bun.spawnSync(["bun", "scripts/symbian-guest.ts"], {
  cwd: root,
  env: process.env,
  stdout: "inherit",
  stderr: "inherit",
});
if (build.exitCode !== 0) {
  throw new Error(`Symbian guest build failed with exit code ${build.exitCode}`);
}
if (!existsSync(bundlePath) || !existsSync(packPath)) {
  throw new Error("Symbian guest build did not produce its JS/PAK pair");
}

const [{ createWasmUi }, { BTN }] = await Promise.all([
  import(wasmOpsPath),
  import(specPath),
]);

interface FigmaViewTelemetry {
  zoom: number;
  minZoom: number;
  centerX: number;
  centerY: number;
}

interface SymbianGlobals {
  ui?: Record<string, unknown>;
  __pak?: ArrayBuffer;
  __simHz?: number;
  frame?: (
    buttons: number,
    analog?: number,
    touches?: readonly number[],
  ) => void;
  __pocketResizeViewport?: (width: number, height: number) => void;
  __pocketFigmaView?: FigmaViewTelemetry;
}

function distinctPixels(rgba: Uint8Array): number {
  const pixels = new Uint32Array(
    rgba.buffer,
    rgba.byteOffset,
    rgba.byteLength / 4,
  );
  const distinct = new Set<number>();
  for (const pixel of pixels) {
    distinct.add(pixel);
    if (distinct.size > 16) break;
  }
  return distinct.size;
}

function packTouch(id: number, x: number, y: number): number {
  return (
    0x80000000 |
    ((id & 0xff) << 20) |
    ((y & 0x3ff) << 10) |
    (x & 0x3ff)
  ) >>> 0;
}

test("real Symbian bundle boots through HostOps and keeps DeepZoom state on rotation", async () => {
  const wasmBytes = await Bun.file(wasmPath).arrayBuffer();
  const wasm = await createWasmUi(wasmBytes, {
    width: 640,
    height: 360,
    rasterDensity: 1,
  });
  const ops = wasm.ops as Record<string, unknown> & {
    __viewport: { w: number; h: number };
  };
  ops.__host = "symbian-e7-dev";
  ops.__hostAbi = 4;
  const textWrites: string[] = [];
  for (const operation of ["setText", "replaceText"] as const) {
    const original = ops[operation] as (id: number, value: string) => void;
    ops[operation] = (id: number, value: string): void => {
      textWrites.push(value);
      original(id, value);
    };
  }

  const globals = globalThis as typeof globalThis & SymbianGlobals;
  globals.ui = ops;
  globals.__pak = await Bun.file(packPath).arrayBuffer();
  globals.__simHz = 30;
  delete globals.frame;
  delete globals.__pocketResizeViewport;
  delete globals.__pocketFigmaView;

  try {
    (0, eval)(await Bun.file(bundlePath).text());
    expect(typeof globals.frame).toBe("function");
    expect(typeof globals.__pocketResizeViewport).toBe("function");
    expect(globals.__pocketFigmaView).toBeDefined();
    expect(textWrites).toContain("T/S page  Q/E zoom  Esc fit");

    const runFrame = (
      buttons = 0,
      analog = 0x8080,
      touches?: readonly number[],
    ): void => {
      globals.frame!(buttons, analog, touches);
      wasm.tick();
    };

    for (let frame = 0; frame < 24; frame++) runFrame();
    const pageNames = [
      "👋 Welcome",
      "🧩 Components",
      "🍉 Stickers",
      "🌈 Examples",
    ];
    for (const pageName of [...pageNames.slice(1), pageNames[0]]) {
      runFrame(BTN.TRIANGLE);
      runFrame();
      expect(
        textWrites.filter((value) => pageNames.includes(value)).at(-1),
      ).toBe(pageName);
    }

    const landscape = wasm.render().slice();
    expect(distinctPixels(landscape)).toBeGreaterThan(8);
    expect(wasm.drawHash?.()).not.toBe(0n);
    const fitZoom = globals.__pocketFigmaView!.zoom;

    for (let frame = 0; frame < 16; frame++) runFrame(BTN.RTRIGGER);
    const centerBeforePan = globals.__pocketFigmaView!.centerX;
    for (let frame = 0; frame < 12; frame++) runFrame(0, 0xff80);
    expect(globals.__pocketFigmaView!.zoom).toBeGreaterThan(fitZoom);
    expect(globals.__pocketFigmaView!.centerX).toBeGreaterThan(centerBeforePan);

    // A stationary direct touch cancels controller momentum before comparing
    // the exact view state across the orientation change.
    runFrame(0, 0x8080, [packTouch(1, 320, 180)]);
    runFrame();
    const telemetry = globals.__pocketFigmaView!;
    const before = { ...telemetry };

    wasm.exports.ui_set_viewport(360, 640);
    ops.__viewport = { w: 360, h: 640 };
    globals.__pocketResizeViewport!(360, 640);
    runFrame();

    expect(globals.__pocketFigmaView).toBe(telemetry);
    expect(telemetry.minZoom).toBeLessThan(before.minZoom);
    expect(telemetry.zoom).toBeCloseTo(before.zoom, 8);
    expect(telemetry.centerX).toBeCloseTo(before.centerX, 8);
    expect(telemetry.centerY).toBeCloseTo(before.centerY, 8);

    const portrait = wasm.render().slice();
    expect(portrait).toHaveLength(360 * 640 * 4);
    expect(distinctPixels(portrait)).toBeGreaterThan(8);
    expect(Buffer.from(portrait).equals(Buffer.from(landscape))).toBe(false);
  } finally {
    delete globals.ui;
    delete globals.__pak;
    delete globals.__simHz;
    delete globals.frame;
    delete globals.__pocketResizeViewport;
    delete globals.__pocketFigmaView;
  }
}, 30_000);
