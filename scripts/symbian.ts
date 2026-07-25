// Build Pocket Figma as an independently installable Nokia E7 / Symbian SIS.
//
// The vendored PocketJS checkout is the default authority. During framework
// development, POCKETJS_ROOT may explicitly select a newer checkout before
// its commit is pinned by this repository.

import { existsSync } from "node:fs";
import { delimiter, dirname, resolve } from "node:path";

const repo = new URL("..", import.meta.url).pathname;
const manifestPath = resolve(repo, "pocket.json");
const outputRoot = resolve(repo, "dist/symbian");
const pocketJsRoot = resolve(
  process.env.POCKETJS_ROOT ?? resolve(repo, "vendor/pocketjs"),
);
const symbianTool = resolve(pocketJsRoot, "tools/symbian.ts");

if (!existsSync(symbianTool)) {
  throw new Error(
    `PocketJS Symbian tooling is unavailable under ${pocketJsRoot}; ` +
      "update vendor/pocketjs or set POCKETJS_ROOT to a checkout that provides tools/symbian.ts",
  );
}

const manifest: unknown = await Bun.file(manifestPath).json();
const version = (
  manifest as { version?: unknown }
).version;
if (typeof version !== "string") {
  throw new Error("pocket.json version must be a string");
}
const sisVersion = version.split(/[+-]/, 1)[0];
const forwarded = Bun.argv.slice(2);
const hasSisVersion = forwarded.some((argument) =>
  argument === "--sis-version" || argument.startsWith("--sis-version=")
);

const command = [
  "bun",
  "tools/symbian.ts",
  "build",
  "app",
  "--manifest",
  manifestPath,
  "--project-root",
  repo,
  "--outdir",
  outputRoot,
  ...(hasSisVersion ? [] : ["--sis-version", sisVersion]),
  ...forwarded,
];
// `rustup run <nightly> cargo` still lets Cargo resolve `rustc` through PATH.
// Put the rustup proxy directory first so a Homebrew stable rustc cannot
// override PocketJS's pinned Symbian nightly.
const rustupPath = Bun.which("rustup");
const buildPath = [
  rustupPath ? dirname(rustupPath) : undefined,
  process.env.PATH,
].filter((entry): entry is string => Boolean(entry)).join(delimiter);
const build = Bun.spawn({
  cmd: command,
  cwd: pocketJsRoot,
  env: { ...process.env, PATH: buildPath },
  stdout: "inherit",
  stderr: "inherit",
});
const exitCode = await build.exited;
if (exitCode !== 0) process.exit(exitCode);
