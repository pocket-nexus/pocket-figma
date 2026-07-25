// A fresh PocketJS source checkout intentionally omits the ignored generated
// style mirror. TypeScript reaches the runtime's relative import before the
// first app build, so seed the smallest valid table. Every real PocketJS build
// overwrites it with the app-specific table embedded in the pak.

import { existsSync } from "node:fs";
import { resolve } from "node:path";

const projectRoot = resolve(new URL("..", import.meta.url).pathname);

export async function ensurePocketJsGenerated(): Promise<void> {
  const framework = resolve(
    projectRoot,
    "vendor/pocketjs/framework/src/index.ts",
  );
  const generated = resolve(
    projectRoot,
    "vendor/pocketjs/framework/src/styles.generated.ts",
  );
  if (!existsSync(framework)) {
    throw new Error(
      "PocketJS framework sources are missing; initialize vendor/pocketjs first",
    );
  }
  if (!existsSync(generated)) {
    await Bun.write(
      generated,
      [
        "// Generated placeholder; PocketJS tools/build.ts replaces this file.",
        "export const STYLE_IDS: Readonly<Record<string, number>> = {};",
        "",
      ].join("\n"),
    );
  }
}

if (import.meta.main) await ensurePocketJsGenerated();
