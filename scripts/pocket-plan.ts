import { $ } from "bun";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import {
  extractHostBuildInputs,
  hostBuildEnvironment,
  type HostBuildInputs,
} from "@pocketjs/framework/manifest";
import { ensurePocketJsGenerated } from "./ensure-pocketjs-generated.ts";

export const projectRoot = new URL("..", import.meta.url).pathname;
export const outputDirectory = `${projectRoot}dist`;
export const pocketJsRoot = resolve(
  process.env.POCKETJS_ROOT ?? resolve(projectRoot, "vendor/pocketjs"),
);
const discoveredPocketCli = [
  resolve(pocketJsRoot, "tools/pocket.ts"),
  resolve(pocketJsRoot, "scripts/pocket.ts"),
].find(existsSync);

if (!discoveredPocketCli) {
  throw new Error(
    `PocketJS manifest tooling is unavailable under ${pocketJsRoot}; ` +
      "update vendor/pocketjs or set POCKETJS_ROOT to the current PocketJS checkout",
  );
}
export const pocketCli = discoveredPocketCli;

/** Resolve, type-check, and compile the app through PocketJS's v2 contract. */
export async function compilePocketTarget(
  target: string,
): Promise<HostBuildInputs> {
  await ensurePocketJsGenerated();
  const manifestPath = `${projectRoot}pocket.json`;
  const planPath = `${projectRoot}.pocket/${target}/plan.json`;

  await $`bun ${pocketCli} compile --target ${target} --manifest ${manifestPath} --project-root ${projectRoot} --outdir ${outputDirectory}`
    .cwd(pocketJsRoot);

  const plan: unknown = await Bun.file(planPath).json();
  return extractHostBuildInputs(plan, { expectedTarget: target });
}

/** Environment shared by the app crate and its framework-native dependency. */
export function nativePlanEnvironment(
  inputs: HostBuildInputs,
): Readonly<Record<string, string>> {
  // This project owns the final PSP/Vita bins and embeds the app in their
  // build.rs files. Framework runtime dependencies publish HostOps only.
  return hostBuildEnvironment(inputs, {
    outputDirectory,
    embedApp: false,
  });
}

if (import.meta.main) {
  await compilePocketTarget(Bun.argv[2] ?? "psp");
}
