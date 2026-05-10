# Feature Map

Last updated: 2026-05-09

## File And Document Features

- Open DXF/DWG from URL via `AcApDocManager.openUrl`.
- Open local DXF/DWG ArrayBuffer via `AcApDocManager.openDocument`.
- Worker-backed DXF parser, DWG parser, and MTEXT renderer.
- Progress events through `open-file-progress`.
- Document lifecycle events: `documentToBeOpened`, `documentCreated`, `documentActivated`.
- Read, Review, and Write open modes via `AcEdOpenMode`.

## View And Navigation

- Pan and zoom through `AcTrLayoutView` camera controls.
- Zoom all/fit drawing, zoom window, zoom to layer.
- Selection mode and pan mode.
- Background/theme switching through sysvars and renderer foreground repaint.
- Layout and paper-space viewport support.
- Axes gizmo for 2D orientation.
- CSS2D overlays for HTML transients such as measurement badges.
- Anonymous dynamic-block display states (`*U...` block references) are
  redrawn without reusing stale data-model block cache output.

## Selection And Interaction

- Single click selection.
- Window and crossing selection by drag direction.
- Replace/add/remove selection actions by modifiers.
- Selection set events with highlight/unhighlight bridge.
- Hover detection with delayed spatial picking.
- Pickbox/sysvar-driven hit radius behavior.
- Delete/Backspace dispatches erase when editor is idle.
- Escape clears selection.

## Commands

Core commands are registered in `AcApDocManager.registerCommands`:

- File/system: `open`, `qnew`, `regen`, `log`, sysvar commands.
- View: `pan`, `zoom`, `switchbg`, `select`.
- Draw: `line`, `pline`, `circle`, `arc`, `ellipse`, `rectang`, `polygon`, `ray`, `xline`, `spline`, `point`, `mline`, `mtext`, `-hatch`, `dimlinear`.
- Modify: `erase`, `move`, `copy`, `rotate`.
- Layer: `-layer`, `laycur`, `laydel`, `layfrz`, `layiso`, `laylck`, `layon`, `layoff`, `laythw`, `layuniso`, `layulk`, `layerp`, `layerclose`.
- Measure: `measuredistance`, `measurearea`, `measureangle`, `measurearc`, `clearmeasurements`.
- Review: `revcircle`, `revcloud`, `revrect`, `revvis`, `sketch`.
- Convert/export: `cdxf`, `csvg`, `pngout`.

Vue UI commands registered in `packages/cad-viewer/src/app/register.ts`:

- `layer`
- `hatch`
- `md`
- `pttype`
- `qselect`
- `properties`

The full example adds:

- `quit`
- `exit`

## Command Interaction Pattern

Commands should:

1. Extend `AcEdCommand`.
2. Set the minimum `AcEdOpenMode`.
3. Use `AcApContext` for document/view access.
4. Use `AcApDocManager.instance.editor` prompt APIs.
5. Add database entities to model space or mutate database objects.
6. Let database events flow through `AcApContext` to update rendering.
7. Clean up jigs, transient entities, HTML overlays, and listeners.

## UI Features

`MlCadViewer.vue` exposes:

- File upload/open.
- Ribbon commands in write mode.
- Main menu and language selector in read/review style modes.
- Entity draw style toolbar.
- Toolbars.
- Palette manager with layer list and entity properties.
- Dialog manager.
- Status bar with theme, settings, notifications, progress, point style, osnap, full screen.
- Entity info panel.
- Notification center.
- Locale support.

## Plugins

Plugin API:

- Implement `AcApPlugin`.
- Provide `name`, optional `version` and `description`.
- Implement `onLoad(context, commandManager)`.
- Implement `onUnload(context, commandManager)`.

Plugin manager supports:

- Loading one plugin instance.
- Loading factory/instance arrays.
- Loading from a folder when a plugin file list is supplied.
- Continue-on-error behavior.
- Unload by name and unload all.

Plugin risks:

- Plugin names must be unique.
- Dynamic browser imports require explicit file lists.
- Plugins must remove commands and event listeners in `onUnload`.

## Examples

`cad-simple-viewer-example`

- Plain TypeScript Vite app.
- Initializes `AcApDocManager` directly.
- Uses custom worker paths under `workers`.
- Supports local file upload, predefined file loading, toolbar commands, pickbox, lineweight toggle.
- Build passed locally and is currently the recommended static deployment target.

`cad-viewer-example`

- Vue app using `MlCadViewer`.
- Starts with upload screen.
- Registers `quit`/`exit` commands.
- Full UI integration target.
- Local build currently blocked by declaration output from `@mlightcad/cad-viewer`.

## Test Coverage Inventory

Unit tests exist for:

- Font loader/doc manager URL behavior.
- Hatch and hatch ribbon commands.
- Layer commands.
- MTEXT command and renderer behavior.
- Hover controller.
- Keyword collection/session.
- Prompt option behavior.
- Selection action.
- Hierarchical spatial index.
- Pick result sorting.
- SVG renderer.
- Three renderer style/font/MTEXT.
- ESM import support.

E2E:

- `packages/cad-viewer-example/e2e/tests/smoke.spec.ts`.
