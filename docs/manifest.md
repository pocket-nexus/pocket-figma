# `pocket.json` — Pocket app contract (format 2)

`pocket.json` describes the portable contract between this application and a
PocketJS target. It is strict data: the framework validates it, resolves a
target profile, and writes one checksummed build plan before either the JS
compiler or native toolchain runs.

Pocket Figma intentionally declares a PSP-shaped baseline rather than separate
PSP and Vita applications:

- a 480×272 logical canvas with `integer-fit` presentation;
- a 640×360 default live viewport that can rotate through 360×640;
- baked glyph text and physical buttons;
- optional left-analog, touch, and live-viewport enhancements;

The PSP profile satisfies that contract at 1×. The Vita profile satisfies the
same contract on its 960×544 fullscreen output and resolves a raster density of
2. The viewer selects its matching checked-in tile manifest through
`platform.pixelRatio`, without branching asset or document behavior on a target
name. Both console targets keep the fixed 480×272 plan. A live-viewport host
such as the Nokia E7 selects the dynamic plan instead and relays orientation
changes without remounting application state. The sole target-name adapter is
the on-screen physical-key legend: portable `BTN` actions stay identical, while
the E7 names its keyboard keys instead of showing PlayStation button symbols.

## Capabilities

Capabilities are plain framework API identifiers. A target advertises only
APIs its stock host has implemented and tested; the manifest's `requires`
entries must all be present or resolution fails.

The two hard requirements in this app are:

| capability |
|---|
| `text.glyphs.baked` |
| `input.buttons` |

`input.analog.left`, `input.touch`, and `display.viewport.live` are
enhancements. DeepZoom falls back from a centered or absent analog stick to
the d-pad, so stickless hosts remain usable; touch adds direct pan and pinch
without replacing the controller path.

DrawList is PocketJS's internal core-to-backend rendering IR, not an API this
application can observe or request, so it is intentionally not a capability.
DeepZoom is implemented over the public host surface; it is not a separate
platform capability.

## Viewport and build boundary

The application owns its fixed baseline plus the accepted dynamic logical
viewport range. The selected target profile owns the physical display and
chooses which viewport mode it can satisfy. The Symbian backend derives its
development UID from the durable app id and its SIS/executable names from the
resolved app output; no private target fields are added to this manifest.

Build behavior stays in `scripts/`. Both native build drivers ask the vendored
PocketJS CLI to validate the manifest, run the ordinary reachable TypeScript
check, and compile from `.pocket/<target>/plan.json`. The public
`extractHostBuildInputs()` helper verifies the plan checksum and projects only
the app output, target, ABI, and viewport required by a custom host. At boot
PocketJS compares target and host ABI; the plan checksum is build-time
consistency data, not a runtime trust mechanism.

Asset provenance, bake commands, store copy, and repository metadata stay in
the README/package metadata rather than the platform compatibility contract.
