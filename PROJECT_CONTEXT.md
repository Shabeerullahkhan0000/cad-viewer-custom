# Project Context

Last updated: 2026-05-09

## Purpose

`cad-viewer` is a browser-only CAD viewer and editor for DXF/DWG files. It parses, converts, renders, and edits drawings in the client without a backend. The repository is a pnpm/Nx monorepo with library packages, Vue UI packages, and example applications.

## Documentation Contract

Before feature, fix, refactor, deployment, or architecture work:

1. Reread the affected source files and these docs.
2. Identify affected systems, root cause, implementation plan, and regression risks.
3. Update these docs before and after the change.
4. Preserve rendering, state, event, command, plugin, and cleanup consistency.
5. Avoid duplicate render loops, duplicate global listeners, blind patches, and temporary hardcoded fixes.

Mandatory docs:

- `PROJECT_CONTEXT.md`: repository purpose, workflow, commands, source map.
- `ARCHITECTURE.md`: package architecture, dependency map, extension boundaries.
- `FEATURE_MAP.md`: user-facing tools, commands, UI, plugins, examples.
- `RENDERING_FLOW.md`: file-to-render path, scene graph, batching, animation, workers.
- `STATE_FLOW.md`: state ownership, events, command/input flow, Vue bridge.
- `KNOWN_ISSUES.md`: risks, technical debt, build/deploy notes, verification checklist.

## Read Scope For This Baseline

Reviewed:

- Root configs: `package.json`, `pnpm-workspace.yaml`, `nx.json`, TypeScript, Vite, Jest, ESLint, README.
- Package manifests for `cad-simple-viewer`, `cad-viewer`, `three-renderer`, `svg-renderer`, examples.
- Core source entrypoints and critical files under `packages/*/src`.
- Rendering classes, scene/layout/layer management, batching, spatial indexes.
- Editor/input/command/session systems and event bus.
- Vue wrapper, app store, composables, ribbons, palettes, status bar entrypoints.
- Plugin manager and command authoring guide.
- Example apps and e2e/unit test inventory.
- TODO/FIXME/event-listener/render-loop hotspots.

Excluded from semantic review:

- `node_modules`, generated `dist`, `.nx`, `.git`.
- SVG icon contents, except index/export behavior.
- Lockfile package internals.

## Workspace State Notes

- Repo cloned from `https://github.com/mlightcad/cad-viewer.git`.
- Dependencies installed with `pnpm.cmd install --frozen-lockfile`.
- Windows PowerShell blocks `.ps1` shims, so use `pnpm.cmd` and `vercel.cmd`.
- Nx daemon had a named-pipe conflict; use `NX_DAEMON=false` for local builds in this environment.
- Vercel CLI login succeeded for account `shabeerullahkhan0000`.
- Vercel CLI added `.vercel` to `.gitignore` during setup.
- `.vercel/project.json` exists and links project `cad-viewer` to team `shabeerullahkhan0000s-projects`.
- `vercel.json` exists at repo root and pins Vercel to the known-good simple example build.
- Rendering fix completed locally: anonymous `BlockReference` entities such as
  `*U916` now invalidate the data-model block render cache around `worldDraw`
  to avoid stale dynamic-block graphics.

## Core Commands

Install:

```powershell
pnpm.cmd install --frozen-lockfile
```

Build all packages:

```powershell
$env:NX_DAEMON='false'; pnpm.cmd run build
```

Run full Vue viewer:

```powershell
$env:NX_DAEMON='false'; pnpm.cmd run dev -- --host 127.0.0.1
```

Run simple viewer:

```powershell
$env:NX_DAEMON='false'; pnpm.cmd run dev:simple -- --host 127.0.0.1
```

Build simple viewer example:

```powershell
$env:NX_DAEMON='false'; pnpm.cmd exec nx run '@mlightcad/cad-simple-viewer-example:build'
```

Preview simple viewer example:

```powershell
pnpm.cmd run preview:simple -- --host 127.0.0.1
```

## Package Map

- `packages/cad-simple-viewer`: framework-agnostic app core, document manager, commands, editor/input, view, plugins, spatial index.
- `packages/cad-viewer`: Vue 3 UI wrapper around `cad-simple-viewer`, ribbons, dialogs, palettes, status bar, composables, i18n.
- `packages/three-renderer`: Three.js renderer implementation, CAD render objects, material/style managers, batching, view/camera primitives.
- `packages/svg-renderer`: SVG conversion renderer.
- `packages/cad-simple-viewer-example`: plain TypeScript/Vite example. It is the safest static deployment target currently observed.
- `packages/cad-viewer-example`: Vue/Vite full UI example using `MlCadViewer`.
- `packages/examples`: static aggregation package for examples/docs hosting.

## Critical Files

- `packages/cad-simple-viewer/src/app/AcApDocManager.ts`
- `packages/cad-simple-viewer/src/app/AcApContext.ts`
- `packages/cad-simple-viewer/src/app/AcApDocument.ts`
- `packages/cad-simple-viewer/src/view/AcTrView2d.ts`
- `packages/cad-simple-viewer/src/view/AcTrScene.ts`
- `packages/cad-simple-viewer/src/view/AcTrLayout.ts`
- `packages/cad-simple-viewer/src/view/AcTrLayer.ts`
- `packages/cad-simple-viewer/src/editor/view/AcEdBaseView.ts`
- `packages/cad-simple-viewer/src/editor/input/ui/AcEdInputManager.ts`
- `packages/cad-simple-viewer/src/editor/command/AcEdCommandStack.ts`
- `packages/cad-simple-viewer/src/editor/global/eventBus.ts`
- `packages/cad-simple-viewer/src/plugin/AcApPluginManager.ts`
- `packages/three-renderer/src/renderer/AcTrRenderer.ts`
- `packages/three-renderer/src/batch/AcTrBatchedGroup.ts`
- `packages/cad-viewer/src/component/MlCadViewer.vue`
- `packages/cad-viewer/src/app/register.ts`
- `packages/cad-viewer/src/app/store.ts`
- `packages/cad-viewer/src/composable/*`
- `packages/cad-simple-viewer-example/vite.config.ts`
- `packages/cad-viewer-example/vite.config.ts`

## Deployment Context

Current safest Vercel target is `packages/cad-simple-viewer-example/dist`, produced by:

```powershell
$env:NX_DAEMON='false'; pnpm.cmd exec nx run '@mlightcad/cad-simple-viewer-example:build'
```

Reason: the simple viewer example build passed locally and passed again after adding `vercel.json`. The full Vue viewer example build currently depends on `@mlightcad/cad-viewer` declarations generated from SVG imports and failed locally when `dist/index.d.ts` was not emitted.

Root `vercel.json`:

- install: `pnpm install --frozen-lockfile`
- build: `NX_DAEMON=false pnpm exec nx run @mlightcad/cad-simple-viewer-example:build`
- output: `packages/cad-simple-viewer-example/dist`
