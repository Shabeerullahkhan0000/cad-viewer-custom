# Known Issues And Risks

Last updated: 2026-05-09

## Build And Environment

- PowerShell blocks `.ps1` shims on this machine. Use `pnpm.cmd` and `vercel.cmd`.
- Nx daemon failed with named pipe `EADDRINUSE`. Use `NX_DAEMON=false`.
- Sandbox filesystem access blocked Vite config loading in some commands. Running build/dev outside the sandbox worked.
- Full root build reached `@mlightcad/cad-viewer-example` and failed because `@mlightcad/cad-viewer` did not emit `dist/index.d.ts`.
- `@mlightcad/cad-viewer` declaration generation reported many missing SVG module declarations during `vite-plugin-dts`, even though `src/svg/svg.d.ts` exists.
- Simple viewer example build passed and preview returned HTTP 200 locally.
- After `vercel.json` was added, the exact Vercel build target passed again.

## Deployment Risks

- `vercel.json` now exists and explicitly deploys the simple viewer example output.
- Vercel CLI added `.vercel` to `.gitignore`.
- `.vercel/project.json` links the local checkout to Vercel project `cad-viewer`.
- Direct Vercel deploy was aborted before completion.
- A Vercel deployment should choose a stable target explicitly:
  - safest current target: `packages/cad-simple-viewer-example/dist`
  - build command: `NX_DAEMON=false pnpm exec nx run @mlightcad/cad-simple-viewer-example:build`
- Worker files must be included at paths expected by the deployed example.
- The full Vue app should not be selected for deployment until declaration/build failure is fixed or intentionally bypassed with a documented tradeoff.

## Rendering And State Risks

- `AcTrView2d` owns the only render loop. Duplicate loops will waste GPU/CPU and can race CSS2D overlay rendering.
- `AcTrView2d` registers global/sysvar/document listeners without an obvious full dispose path for all of them. Recreating the singleton repeatedly may leak listeners unless destroy/dispose is improved.
- `AcEdBaseView` creates a `ResizeObserver` without an exposed dispose path.
- `AcEdHoverController.dispose` exists, but the base view currently only clears hover, not a full view dispose lifecycle.
- `AcTrLayout.updateEntity` has TODO for spatial index update. Geometry-modifying updates can leave picking/selection/hover stale.
- Layer rename handling is TODO in `AcTrLayout.updateLayer`.
- Image entity update uses a delayed dirty flag because immediate dirty flag was not enough.
- Highlighting skips or ignores cases with more than 1000 batched objects for performance.
- Group/block decomposition across layers is complex and must preserve object id, child boxes, layer-0 inheritance, and layer-bound material metadata.
- Anonymous AutoCAD block references such as `*U916` are often dynamic-block
  display states. The current upstream data-model cache intends not to cache
  `*U` blocks, but its guard checks the class name instead of the active block
  table record name. Local mitigation now invalidates the render cache around
  anonymous `BlockReference` draws to avoid stale or incorrect
  bathroom/furniture block graphics. Once the dependency is fixed upstream,
  this mitigation can be replaced with the upstream cache-key/guard behavior.
- Infinite entities such as rays/xlines intentionally do not extend drawing bounding boxes.

## Input And Event Risks

- Global `document.addEventListener('keydown')` in `AcTrView2d` can duplicate if multiple views are created.
- `AcEdCommandLine` uses window/document listeners and resize observers; verify cleanup before repeated mount/unmount scenarios.
- `useDocumentOpening`, `useDocOpenMode`, `useDark`, and some composables use singleton retry/listener guards. New code must not accidentally create duplicate singleton listeners.
- Some Vue eventBus listeners in `MlCadViewer.vue` are registered at setup scope and are not visibly unsubscribed on unmount.
- Prompt sessions must always cleanup document/canvas/contextmenu listeners in cancel, keyword, none, error, and success paths.

## Feature/Data Limitations From README And Source

- DWG tables unsupported due to LibreDWG limitation.
- XRefs unsupported.
- Some DWG files may fail due to LibreDWG parser issues.
- Tianzheng proprietary custom objects require T3 conversion before reliable viewing.
- Some unknown/unsupported entities are reported and not shown.
- Viewport entity support is not complete in roadmap.
- OSNAP endpoint for INSERT and several snap modes are incomplete.
- Undo/redo, many edit operations, blocks creation/insertion, dimensions, persistence, and collaboration remain planned/incomplete.
- SVG renderer has TODOs around correct entity behavior and elliptical arc rotation.
- Three renderer has TODOs for adaptive arc/ellipse segment counts, complex linetypes, MText by-layer/by-block colors, buffer geometry ownership, and some hatch patterns.

## Testing Gaps

- Unit tests cover important command/input/render utilities but not every UI lifecycle path.
- E2E coverage appears limited to the full viewer smoke path.
- Deployment worker path behavior needs verification after any Vercel config change.
- Repeated mount/unmount of `MlCadViewer` should be tested before adding lifecycle-sensitive features.
- Spatial index update behavior should be tested before editing commands that mutate entity bounds.
- The anonymous block cache mitigation has targeted package/example build
  coverage, but still needs visual verification with the user's actual DWG/DXF.

## Change Checklist

Before change:

1. Reread affected files and these docs.
2. Identify affected systems and regression risks.
3. Explain root cause and implementation plan.
4. Update docs with expected architecture/flow impact.

During change:

1. Preserve event bridge ownership.
2. Avoid duplicate listeners/render loops.
3. Prefer command/editor/view APIs over direct internals.
4. Add cleanup for every listener, transient, overlay, material, geometry, and plugin resource.

After change:

1. Update docs with actual flow/dependency/risk changes.
2. Run targeted tests/builds.
3. Verify local run or preview when UI/render/deploy behavior changes.
4. Record any skipped verification.
