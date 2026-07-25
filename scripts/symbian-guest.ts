// Build the real target-bound Symbian guest without invoking the native
// Rust/GCCE/Docker packaging stages. This is the fast HostOps smoke boundary.

import { existsSync, mkdirSync, rmSync } from "node:fs";
import { resolve } from "node:path";

const repo = new URL("..", import.meta.url).pathname;
const pocketJsRoot = resolve(
  process.env.POCKETJS_ROOT ?? resolve(repo, "vendor/pocketjs"),
);
const profilePath = resolve(pocketJsRoot, "tools/symbian-profile.ts");
const buildTool = resolve(pocketJsRoot, "tools/build.ts");
if (!existsSync(profilePath) || !existsSync(buildTool)) {
  throw new Error(
    `PocketJS Symbian guest tooling is unavailable under ${pocketJsRoot}; ` +
      "update vendor/pocketjs or set POCKETJS_ROOT to the current PocketJS checkout",
  );
}

const { resolveSymbianE7BuildPlan } = await import(profilePath);
const manifestPath = resolve(repo, "pocket.json");
const manifest: unknown = await Bun.file(manifestPath).json();
const plan = resolveSymbianE7BuildPlan(manifest);
const outputRoot = resolve(repo, "dist/symbian/guest");
const planPath = resolve(outputRoot, "plan.json");

rmSync(outputRoot, { recursive: true, force: true });
mkdirSync(outputRoot, { recursive: true });
await Bun.write(planPath, `${JSON.stringify(plan, null, 2)}\n`);

const build = Bun.spawn({
  cmd: [
    "bun",
    "tools/build.ts",
    `--plan=${planPath}`,
    `--project-root=${repo}`,
    `--outdir=${outputRoot}`,
  ],
  cwd: pocketJsRoot,
  env: process.env,
  stdout: "inherit",
  stderr: "inherit",
});
const exitCode = await build.exited;
if (exitCode !== 0) process.exit(exitCode);

for (const extension of ["js", "pak"]) {
  const artifact = resolve(outputRoot, `${plan.app.output}.${extension}`);
  if (!existsSync(artifact)) {
    throw new Error(`PocketJS Symbian guest build did not produce ${artifact}`);
  }
  console.log(`output: ${artifact}`);
}
