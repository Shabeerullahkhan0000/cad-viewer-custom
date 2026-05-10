# Architecture

Last updated: 2026-05-09

## High-Level Shape

The project is a layered monorepo:

1. External CAD/data packages parse and model drawings.
2. `three-renderer` converts data-model draw calls into Three.js render objects.
3. `cad-simple-viewer` owns document lifecycle, commands, editor input, view state, scene state, and plugin hooks.
4. `cad-viewer` wraps the core in Vue UI: ribbon, palettes, dialogs, status bar, notifications, and i18n.
5. Example apps provide plain TypeScript and Vue integration surfaces.

## Dependency Direction

Allowed direction:

```text
examples
  -> cad-viewer
      -> cad-simple-viewer
          -> three-renderer
          -> svg-renderer
          -> data-model / libredwg-converter / mtext-renderer
```

`three-renderer` must not depend on Vue UI. `cad-simple-viewer` must stay framework-agnostic. `cad-viewer` may depend on Vue, Element Plus, and composables.

## External Dependencies

- `@mlightcad/data-model`: database, entities, events, geometry, sysvars, file converters, draw interfaces.
- `@mlightcad/libredwg-converter`: DWG parser/converter worker integration.
- `@mlightcad/mtext-renderer`: MTEXT layout/rendering and worker.
- `@mlightcad/mtext-input-box`: MTEXT editor UI support.
- `three`: WebGL rendering, camera, scene, geometry, materials.
- `three/examples`: wide lines, CSS2DRenderer, OrbitControls/stats-style utilities.
- `@mlightcad/three-viewcube`: 2D axes gizmo.
- `rbush`: spatial indexing.
- `mitt`: global app event bus.
- `vue`, `vue-i18n`, `@vueuse/core`, `element-plus`: full UI package.
- `vite`, `nx`, `typescript`, `jest`, `playwright`: build/test tooling.

## Core Runtime Objects

`AcApDocManager`

- Singleton entrypoint.
- Creates `AcApDocument`, `AcTrView2d`, `AcApContext`, `AcEdCommandStack`, `AcApPluginManager`, `AcApFontLoader`, and `AcApProgress`.
- Registers default commands and system variable commands.
- Registers DXF/DWG converters and MTEXT worker.
- Opens URL/file content, dispatches document lifecycle events, clears view before open, zooms after open.

`AcApDocument`

- Owns one `AcDbDatabase`.
- Tracks URI, file name, document title, and open mode.
- Opens URI or ArrayBuffer content and emits failure events.

`AcApContext`

- Binds document and view.
- Subscribes database entity/layer/layout/sysvar events and forwards them to view methods.
- Subscribes selection events and forwards highlight/unhighlight to view.

`AcTrView2d`

- Concrete view implementation.
- Owns WebGL renderer, CSS2DRenderer, scene, layout view manager, stats, animation loop, and selection gestures.
- Converts DB entities asynchronously into render entities and adds them to scene.
- Guards anonymous AutoCAD block references (`*U...`) by invalidating the
  upstream data-model render cache before and after their `worldDraw` call.
- Handles selection, hover, pan/zoom, theme/background, layout switching, and lineweight/point rerendering.

`AcEditor` and `AcEdInputManager`

- Command-facing input API.
- Manages command prompts, floating inputs, command line, scripted inputs, entity selection, right-click behavior, OSNAP markers, and cleanup.

`AcEdCommandStack`

- Registers commands by group, global name, local name, and aliases.
- Enforces alias/name conflict checks.
- Filters commands by document open mode.

`AcApPluginManager`

- Loads/unloads plugin instances from config or dynamic import lists.
- Gives plugins access to `AcApContext` and `AcEdCommandStack`.
- Plugins are responsible for removing their commands/listeners on unload.

## Scene Architecture

```text
AcTrScene
  THREE.Scene
  layouts: Map<blockTableRecordId, AcTrLayout>
    AcTrLayout
      THREE.Group
      layers: Map<layerName, AcTrLayer>
        AcTrLayer
          AcTrBatchedGroup
            batched line/mesh/point containers by material id
            unbatched object group
            selected object group
            hover object group
      AcTrHierarchicalSpatialIndex
  AcTrTransientManager
  AcTrHtmlTransientManager
```

## Renderer Architecture

`AcTrRenderer` implements the data-model `AcGiRenderer` contract and creates render primitives:

- points
- lines
- line segments
- arcs/ellipses approximated by points
- areas/hatches
- MTEXT
- images
- groups

`AcTrStyleManager` and material managers own color, layer-bound materials, line patterns, hatches, point style, foreground/background repaint, lineweight mode, and cached material disposal.

`AcTrBatchedGroup` reduces draw calls by grouping geometry into typed batch containers by material id. Unsupported paths stay in an unbatched group.

Anonymous block cache mitigation lives in `cad-simple-viewer` instead of
`three-renderer` because the stale-cache decision happens before Three.js
objects are batched. The renderer continues to receive normal `AcTrGroup`
output and the existing layer/group/batch flow remains unchanged.

## Vue UI Architecture

`MlCadViewer.vue` is the full UI shell:

- Initializes `AcApDocManager` through `initializeCadViewer`.
- Registers extra UI commands/dialogs/MTEXT color picker.
- Handles URL/local file opening.
- Owns layout shell: ribbon/header, canvas container, toolbars, palettes, dialogs, status bar, file reader, entity info, notifications.
- Bridges global engine events to Element Plus messages and notification center.

Vue state is mostly composable-driven:

- `store.ts`: small reactive UI store for file name and dialog state.
- `useSettings`: mirrors `AcApSettingManager`.
- `useDark` / `useSystemVars`: bridges UI theme to CAD sysvars.
- `useDocumentOpening` / `useDocOpenMode`: tracks lifecycle/open mode.
- `useLayers`, `useLayouts`, `useSelectionSet`, `useHover`: bridges engine events into reactive UI.

## Extension Rules

- Add core commands under `packages/cad-simple-viewer/src/command` and export from command index.
- Register core commands in `AcApDocManager.registerCommands`.
- Add Vue-only commands under `packages/cad-viewer/src/command` and register in `packages/cad-viewer/src/app/register.ts`.
- Commands must use `AcEditor` prompt APIs instead of raw DOM listeners.
- Commands that create temporary previews must use jigs, transient entities, or HTML transient manager and must clean up.
- New renderable CAD entity support belongs in data-model world draw plus `three-renderer` primitive support, not in UI code.
- New UI panels should subscribe/unsubscribe to engine events in lifecycle hooks or an explicit cleanup path.
- Plugin commands/listeners must be removed in `onUnload`.
- Do not create another `requestAnimationFrame` loop outside `AcTrView2d` unless the architecture is updated first.
- Do not mutate scene/layout/layer internals from Vue components; go through document, view, command, or manager APIs.
