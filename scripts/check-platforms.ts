import {
  pocketCli,
  pocketJsRoot,
  projectRoot,
} from "./pocket-plan.ts";

for (const target of ["psp", "vita"]) {
  const check = Bun.spawn({
    cmd: [
      "bun",
      pocketCli,
      "check",
      "--target",
      target,
      "--manifest",
      `${projectRoot}pocket.json`,
      "--project-root",
      projectRoot,
    ],
    cwd: pocketJsRoot,
    env: process.env,
    stdout: "inherit",
    stderr: "inherit",
  });
  const exitCode = await check.exited;
  if (exitCode !== 0) process.exit(exitCode);
}
