# Rendering Flow

Last updated: 2026-05-09

## File To Scene Flow

1. UI or caller invokes `AcApDocManager.openUrl` or `openDocument`.
2. `AcApDocManager.onBeforeOpenDocument` dispatches lifecycle event and clears the current view.
3. `AcApDocument` opens content through `AcDbDatabase.openUri` or `AcDbDatabase.read`.
4. DXF/DWG converter workers parse drawing data into `AcDbDatabase`.
5. Database emits entity, layer, layout, progress, and sysvar events.
6. `AcApContext` forwards database events to `AcTrView2d`.
7. `AcTrView2d.addEntity` schedules async `batchConvert`.
8. Each `AcDbEntity.worldDraw(renderer, delay)` produces `AcTrEntity`/`AcTrGroup`.
9. View assigns object id, owner id, layer name, visibility, and adds to `AcTrScene`.
10. Scene routes entity to layout and layer.
11. Layer batches geometry in `AcTrBatchedGroup`.
12. Spatial index stores query boxes for selection, hover, snapping, and picking.
13. Animation loop renders dirty frames only.

## Anonymous Block Reference Guard

Active diagnosis: bathroom/furniture symbols selected as `BlockReference`
with anonymous names such as `*U916` can render stale or incorrect graphics
when the upstream data-model block render cache reuses anonymous block output.
Anonymous AutoCAD blocks are commonly generated for dynamic block states and
must be treated as state-sensitive render input.

Rendering rule:

- Before drawing an `AcDbBlockReference` whose `blockName` starts with `*U`,
  invalidate the data-model block render cache so the anonymous block is
  regenerated from its current block table record.
- After the draw, invalidate again so the anonymous result is not reused by a
  later reference.
- Normal named blocks may continue using the data-model cache.
- Implemented in `AcTrView2d.drawEntity` through
  `isAnonymousBlockReference`.

Affected path:

```text
AcTrView2d.drawEntity
  anonymous AcDbBlockReference?
    -> AcDbRenderingCache.instance.clear()
  -> entity.worldDraw(renderer)
  anonymous AcDbBlockReference?
    -> AcDbRenderingCache.instance.clear()
```

Regression risks:

- Anonymous block redraws cost more CPU than cached named block reuse.
- Clearing the shared cache also drops named block entries already cached in
  the current open document; this is intentional for correctness until the
  upstream anonymous-block cache key/guard is fixed.
- Selection, layer inheritance, child spatial boxes, and batching still flow
  through the existing `AcTrGroup`/`handleGroup` path.

Verification:

- `pnpm.cmd --filter @mlightcad/cad-simple-viewer build` passed.
- `pnpm.cmd --filter @mlightcad/cad-simple-viewer-example build` passed.

## Renderer Primitive Flow

Data-model entities call `AcTrRenderer`, which creates Three.js backed objects:

- `point` -> `AcTrPoint`
- `lines` and arcs/ellipses -> `AcTrLine`
- `lineSegments` -> `AcTrLineSegments`
- `area` -> `AcTrPolygon`
- `mtext` -> `AcTrMText`
- `image` -> `AcTrImage`
- `group` -> `AcTrGroup`

`AcTrRenderer` also owns:

- Clear color and clear alpha.
- Foreground/background repaint.
- Lineweight mode.
- Layer material updates.
- Font mapping.
- MTEXT renderer style override.
- Camera zoom shader uniform updates.

## Scene Graph

```text
AcTrView2d
  AcTrRenderer
  AcTrScene
    THREE.Scene
    AcTrLayout per block table record
      THREE.Group
      AcTrLayer per CAD layer
        AcTrBatchedGroup
    AcTrTransientManager
    AcTrHtmlTransientManager
  AcTrLayoutViewManager
    AcTrLayoutView per layout
      AcTrBaseView camera
      viewport views
      axes gizmo
  CSS2DRenderer
```

## Dirty Frame Loop

`AcTrView2d` starts one `requestAnimationFrame` loop:

1. Schedule next frame.
2. Dispatch `renderFrame`.
3. If `_isDirty` is false, return early.
4. Render active layout via `AcTrLayoutViewManager`.
5. Render CSS2D overlays with current scene/camera.
6. Update stats.
7. Set `_isDirty` false.

Rules:

- Do not add duplicate render loops.
- Mark `_isDirty = true` after scene, material, layer, camera, selection, hover, or overlay changes.
- Long-running conversion should decrement `_numOfEntitiesToProcess` in `finally`.
- Stop/cancel loop before introducing any dispose behavior that removes canvas or renderer.

## Layout And Viewport Flow

- `AcTrScene` stores layouts by block table record id.
- Active layout id controls layout visibility.
- `AcTrLayoutViewManager` stores camera/control state per layout.
- On layout switch:
  - active layout id changes,
  - layout view is created if needed,
  - layout entities are lazily loaded if needed,
  - view is marked dirty.
- Paper-space viewport entities create `AcTrViewportView` instances.
- Layout render pass draws the main scene and then model-space content inside paper-space viewports.

## Layer Flow

- Database layer append/modify events are forwarded by `AcApContext`.
- View creates/updates `AcTrLayer` in every layout.
- Renderer updates layer-bound material caches.
- Layer visibility derives from `isFrozen` and `isOff`.
- Layer style changes update materials in batched groups.

## Batching Flow

`AcTrBatchedGroup` stores geometry by material id and render object kind:

- line batches
- indexed line batches
- wide-line `LineSegments2` batches
- mesh batches
- indexed mesh batches
- point batches
- point-symbol batches
- unbatched group
- selected highlight group
- hover highlight group

Important rules:

- One object id may map to multiple batch entries, especially INSERT/block decomposition.
- Block layer `0` content may inherit INSERT layer material bindings.
- Highlighting clones render objects/materials and must dispose clones on unhighlight.
- Updating/removing entities must keep batch maps, unbatched maps, highlight groups, and spatial index consistent.

## Spatial Query Flow

- `AcTrLayout` owns `AcTrHierarchicalSpatialIndex`.
- Root index stores coarse entity bounds.
- Child indexes store fine-grained group/block/subentity boxes.
- Large child sets use R-tree; smaller sets use linear index.
- `search` returns root hits, optionally with child hits.
- Selection box, hover, pick, snapping, and hit tests depend on spatial index freshness.

Known risk: `AcTrLayout.updateEntity` currently has a TODO for spatial index updates. Changes that modify geometry bounds must address stale query data.

## Transients And HTML Overlays

- CAD transients go through `AcTrView2d.addTransientEntity` and `removeTransientEntity`.
- DOM overlays should use `AcTrHtmlTransientManager` so CSS2DRenderer keeps them aligned with world coordinates.
- Measurement tools register cleanup to remove both CAD transients and HTML overlay entries.

## Worker Asset Flow

Workers are registered in `AcApDocManager.registerWorkers`:

- DXF parser default: `./assets/dxf-parser-worker.js`
- DWG parser default: `./assets/libredwg-parser-worker.js`
- MTEXT renderer default: `./assets/mtext-renderer-worker.js`

Examples override worker paths:

- Simple example copies workers to `workers`.
- Full viewer example copies workers to `assets`.

Deployment must preserve copied worker paths.
