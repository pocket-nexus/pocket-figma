import { describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

const root = new URL("..", import.meta.url).pathname;
const pocketJsRoot = resolve(
  process.env.POCKETJS_ROOT ?? resolve(root, "vendor/pocketjs"),
);
const profilePath = resolve(pocketJsRoot, "tools/symbian-profile.ts");
const packagePath = resolve(pocketJsRoot, "tools/symbian-package.ts");

if (!existsSync(profilePath) || !existsSync(packagePath)) {
  throw new Error(
    `PocketJS Symbian contract is unavailable under ${pocketJsRoot}; ` +
      "update vendor/pocketjs or set POCKETJS_ROOT to the current PocketJS checkout",
  );
}

const [{ resolveSymbianE7BuildPlan }, { symbianPackageIdentity }] =
  await Promise.all([
    import(profilePath),
    import(packagePath),
  ]);
const manifest = await Bun.file(resolve(root, "pocket.json")).json();
const script = await Bun.file(resolve(root, "scripts/symbian.ts")).text();

describe("Pocket Figma Symbian package contract", () => {
  test("resolves the dynamic E7 viewport with controller fallbacks", () => {
    const plan = resolveSymbianE7BuildPlan(manifest);
    expect(plan.target).toEqual({ id: "symbian-e7-dev", hostAbi: 4 });
    expect(plan.viewport).toMatchObject({
      logical: [640, 360],
      physical: [640, 360],
      presentation: "native",
      rasterDensity: 1,
    });
    expect(plan.features).toMatchObject({
      "display.viewport.live": true,
      "input.analog.left": false,
      "input.buttons": true,
      "input.touch": true,
      "text.glyphs.baked": true,
    });
  });

  test("derives an app-specific UID, executable, SIS, and receipt", () => {
    const identity = symbianPackageIdentity(
      resolveSymbianE7BuildPlan(manifest),
    );
    expect(identity).toEqual({
      appId: "dev.pocket-stack.figma",
      appOutput: "pocket-figma",
      title: "Pocket Figma",
      uid: "0xEEB7A533",
      executable: "PocketJsPocketFigmaEEB7A533",
      sisFile: "pocket-figma.sis",
      receiptFile: "pocket-figma.receipt.json",
    });
  });

  test("delegates the downstream build to PocketJS with explicit roots", () => {
    expect(script).toContain('"tools/symbian.ts"');
    expect(script).toContain('"--manifest"');
    expect(script).toContain('"--project-root"');
    expect(script).toContain('"--outdir"');
    expect(script).not.toContain('"--uid"');
    expect(script).toContain('Bun.which("rustup")');
    expect(script).toContain("dirname(rustupPath)");
  });
});
