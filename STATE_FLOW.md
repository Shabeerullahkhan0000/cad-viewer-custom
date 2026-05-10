# State Flow

Last updated: 2026-05-09

## State Ownership

`AcApDocManager`

- Singleton app state.
- Current `AcApContext`, document, view, editor, command manager, plugin manager, base URL, progress, font loader.

`AcApDocument`

- Database, file name, document title, URI, open mode.

`AcDbDatabase` from data-model

- Drawing entities, layers, layouts, system variables, conversion/open progress.
- Emits entity/layer/layout/sysvar/progress events.

`AcTrView2d`

- Render state, scene, dirty flag, active layout view, selection gestures, missed images, stats, animation loop id.
- Anonymous `BlockReference` cache invalidation is render-local and does not
  add persistent view state, listeners, or extra render loops.

`AcEdBaseView`

- Canvas/container, dimensions, current mouse position, selection set, editor, hover controller.

`AcEditor` / `AcEdInputManager`

- Prompt/session state, command line, floating inputs, scripted inputs, modifier snapshots, entity-selection active flag, cursor state.

`AcApSettingManager`

- Persistent UI/render settings in localStorage under `settings`.
- Emits setting modified events.

Vue `store`

- UI-only state: file name and dialog/palette state.

## Document Lifecycle Flow

```text
openUrl/openDocument
  -> documentToBeOpened
  -> view.clear()
  -> database open/read
  -> database events populate view
  -> documentActivated
  -> setActiveLayout()
  -> zoomTo drawing/database extents
```

Failure flow:

```text
database open/read throws
  -> eventBus.emit('failed-to-open-file')
  -> Vue messages/notification center
  -> document opening state reset
```

## Database To View Events

`AcApContext` bridges:

- `entityAppended` -> `view.addEntity`
- `entityModified` -> `view.updateEntity`
- `entityErased` -> `view.removeEntity`
- `layerAppended` -> `view.addLayer`
- `layerModified` -> `view.updateLayer`
- `dictObjetSet` with `AcDbLayout` -> `view.addLayout`
- `PDMODE` sysvar -> `view.rerenderPoints`
- `LWDISPLAY` sysvar -> renderer lineweight mode, view clear, database regen
- selection added -> `view.highlight`
- selection removed -> `view.unhighlight`

This bridge is critical. Adding parallel listeners for the same mutation can duplicate rendering work or break highlight/state consistency.

## Command Flow

```text
sendStringToExecute(commandScript)
  -> split command and scripted inputs
  -> lookup global/local/alias command
  -> check open-mode compatibility
  -> editor.clearScriptInputs()
  -> editor.enqueueScriptInputs(...)
  -> command.trigger(context)
      -> commandWillStart
      -> command.execute(context)
      -> commandEnded
  -> editor.clearScriptInputs()
```

Interactive commands call `AcEditor`:

- `getPoint`
- `getAngle`
- `getDistance`
- `getDouble`
- `getInteger`
- `getString`
- `getKeywords`
- `getEntity`
- `getSelection`
- `getBox`

Prompt results use `AcEdPromptStatus` and may return OK, Cancel, None, Keyword, or Error.

## Input And Gesture Flow

Canvas movement:

```text
mousemove
  -> viewportToCanvas
  -> screenToWorld
  -> view.curPos and curMousePos
  -> view.events.mouseMove
  -> hover controller if selection mode and editor idle
```

Selection drag:

```text
mousedown left in selection mode
  -> save start canvas/world point
  -> create selection preview rect
mousemove
  -> update preview rect
mouseup
  -> click pick or box selection
  -> applySelection
  -> selectionSet events
  -> AcApContext highlight bridge
```

Prompt session:

```text
command execute
  -> editor.getX(...)
  -> AcEdInputManager active=true
  -> floating input / command-line keyword session / raw listeners
  -> parse/validate
  -> cleanup listeners and UI in all exit paths
```

## Vue State Bridge

`MlCadViewer.vue`

- Initializes manager on mount.
- Applies props for URL/localFile/background/theme/open mode.
- Updates `store.fileName` after open.
- Emits `create` after initialization and initial open scheduling.
- Emits `destroy` before manager destroy.
- Registers global eventBus listeners for messages, font failures, open failures, and layer close.

Composable bridge:

- `useSettings`: reactive mirror of `AcApSettingManager`.
- `useDark`: syncs `COLORTHEME` sysvar and DOM `dark` class.
- `useSystemVars`: normalizes sysvar values for UI controls.
- `useDocumentOpening`: tracks open progress and failure.
- `useDocOpenMode`: tracks document open mode.
- `useSelectionSet`: mirrors current view selection set with cleanup on unmount.
- `useHover`: mirrors hover entity.
- `useLayers`: observes database layer events and document activation.
- `useLayouts`: observes layout switching and document activation.

## Event Channels

Engine event managers:

- Database events from `@mlightcad/data-model`.
- View events from `AcEdBaseView`.
- Editor command/sysvar events.
- Settings manager modified events.
- Document manager lifecycle events.
- Plugin lifecycle hooks.

Global `eventBus` events:

- `open-file`
- `close-layer-manager`
- `open-file-progress`
- `message`
- `fonts-not-found`
- `fonts-not-loaded`
- `failed-to-get-avaiable-fonts`
- `failed-to-open-file`
- `font-not-found`

## Cleanup Rules

- Every listener added inside a component lifecycle must be removed on unmount unless it is intentionally singleton lifetime.
- Every prompt/session listener must be removed in a centralized cleanup path.
- Every transient entity or HTML transient must be removed by command cleanup.
- Every cloned material/geometry used for highlight or temporary rendering must be disposed.
- Plugin `onUnload` must remove commands/listeners/resources.
- Any new singleton listener must be documented with its lifetime and idempotency guard.
