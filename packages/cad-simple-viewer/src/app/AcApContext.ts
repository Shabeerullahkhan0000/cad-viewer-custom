import {
  AcDbEntity,
  AcDbLayout,
  AcDbSystemVariables,
  AcDbSysVarManager,
  log
} from '@mlightcad/data-model'

import { AcEdBaseView } from '../editor/view/AcEdBaseView'
import { AcTrView2d } from '../view'
import { AcApDocument } from './AcApDocument'

const MOBILE_ENTITY_APPEND_CHUNK_SIZE = 50

const getIsMobile = () => {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return false
  }

  const isMobile = window.matchMedia('(pointer: coarse)').matches
  return isMobile
}

const scheduleMobileBridgeTask = (callback: () => void) => {
  const scheduler = (
    typeof globalThis !== 'undefined'
      ? (globalThis as {
          scheduler?: {
            postTask?: (callback: () => void) => Promise<unknown>
          }
        }).scheduler
      : undefined
  )

  if (typeof scheduler?.postTask === 'function') {
    scheduler.postTask(callback).catch(error => {
      log.warn('[AcApContext] scheduler.postTask failed, falling back:', error)
      setTimeout(callback, 0)
    })
    return
  }

  setTimeout(callback, 0)
}

/**
 * Application context that binds a CAD document with its associated view.
 *
 * This class establishes the connection between a CAD document (containing the drawing database)
 * and its visual representation (the view). It handles event forwarding between the document
 * and view to keep them synchronized.
 *
 * The context manages:
 * - Entity lifecycle events (add, modify, remove)
 * - Layer visibility changes
 * - System variable changes (like point display mode)
 * - Entity selection and highlighting
 *
 * @example
 * ```typescript
 * const document = new AcApDocument();
 * const view = new AcTrView2d();
 * const context = new AcApContext(view, document);
 *
 * // The context will automatically sync changes between document and view
 * // For example, when entities are added to the document, they appear in the view
 * ```
 */
export class AcApContext {
  /** The view component that renders the CAD drawing */
  private _view: AcEdBaseView
  /** The document containing the CAD database */
  private _doc: AcApDocument
  /** Mobile gate used to keep desktop document/view synchronization untouched. */
  private readonly _isMobile = getIsMobile()
  /** Entity append events waiting for chunked mobile bridge delivery. */
  private _pendingEntityAppends: AcDbEntity[] = []
  /** True while a mobile entity-drain task is already scheduled. */
  private _isEntityAppendDrainScheduled = false
  /** Resolvers waiting until the mobile entity append buffer is empty. */
  private _entityAppendIdleResolvers: Array<() => void> = []

  /**
   * Creates a new application context that binds a document with its view.
   *
   * The constructor sets up event listeners to synchronize the document and view:
   * - Entity additions/modifications are reflected in the view
   * - Layer visibility changes update the view
   * - System variable changes (like point display mode) update rendering
   * - Entity selections show/hide grip points
   *
   * @param view - The view used to display the drawing
   * @param doc - The document containing the drawing database
   */
  constructor(view: AcEdBaseView, doc: AcApDocument) {
    this._view = view
    this._doc = doc

    // Add entity to scene
    doc.database.events.entityAppended.addEventListener(args => {
      if (this._isMobile) {
        this.enqueueMobileEntityAppend(args.entity)
        return
      }

      this.view.addEntity(args.entity)
    })

    // Update entity
    doc.database.events.entityModified.addEventListener(args => {
      this.view.updateEntity(args.entity)
    })

    // Erase entity
    doc.database.events.entityErased.addEventListener(args => {
      this.view.removeEntity(args.entity)
    })

    // Set layer visibility
    doc.database.events.layerAppended.addEventListener(args => {
      this._view.addLayer(args.layer)
    })

    // Update layer information such as visibility
    doc.database.events.layerModified.addEventListener(args => {
      this._view.updateLayer(args.layer, args.changes)
    })

    // Set point display mode
    AcDbSysVarManager.instance().events.sysVarChanged.addEventListener(args => {
      if (args.name == AcDbSystemVariables.PDMODE.toLowerCase()) {
        ;(this._view as AcTrView2d).rerenderPoints(args.database.pdmode)
      } else if (args.name == AcDbSystemVariables.LWDISPLAY.toLowerCase()) {
        const view = this._view as AcTrView2d
        const showLineWeight = !!args.database.lwdisplay
        if (view.renderer.showLineWeight !== showLineWeight) {
          view.renderer.showLineWeight = showLineWeight
          // Existing line objects may need different geometry/material classes.
          // Regenerate to rebuild scene content using the new display mode.
          view.clear()
          args.database.regen()
        }
      }
    })

    doc.database.events.dictObjetSet.addEventListener(args => {
      if (args.object instanceof AcDbLayout) {
        this._view.addLayout(args.object as AcDbLayout)
      }
    })

    // Show their grip points when entities are selected
    view.selectionSet.events.selectionAdded.addEventListener(args => {
      view.highlight(args.ids)
    })

    // Hide their grip points when entities are deselected
    view.selectionSet.events.selectionRemoved.addEventListener(args => {
      view.unhighlight(args.ids)
    })
  }

  /**
   * Gets the view component that renders the CAD drawing.
   *
   * @returns The associated view instance
   */
  get view() {
    return this._view
  }

  /**
   * Gets the document containing the CAD database.
   *
   * @returns The associated document instance
   */
  get doc(): AcApDocument {
    return this._doc
  }

  /**
   * Resolves once all mobile-buffered entity append events have been forwarded
   * to the view. Desktop keeps the original synchronous bridge and resolves
   * immediately.
   */
  whenEntityAppendsIdle() {
    if (!this._isMobile || !this.hasPendingEntityAppends()) {
      return Promise.resolve()
    }

    return new Promise<void>(resolve => {
      this._entityAppendIdleResolvers.push(resolve)
      this.scheduleEntityAppendDrain()
    })
  }

  private enqueueMobileEntityAppend(entity: AcDbEntity | AcDbEntity[]) {
    if (Array.isArray(entity)) {
      this._pendingEntityAppends.push(...entity)
    } else {
      this._pendingEntityAppends.push(entity)
    }
    this.scheduleEntityAppendDrain()
  }

  private scheduleEntityAppendDrain() {
    if (this._isEntityAppendDrainScheduled) return

    this._isEntityAppendDrainScheduled = true
    scheduleMobileBridgeTask(() => this.drainEntityAppendBuffer())
  }

  private drainEntityAppendBuffer() {
    this._isEntityAppendDrainScheduled = false

    const chunk = this._pendingEntityAppends.splice(
      0,
      MOBILE_ENTITY_APPEND_CHUNK_SIZE
    )
    if (chunk.length > 0) {
      try {
        this.view.addEntity(chunk)
      } catch (error) {
        log.error('[AcApContext] Failed to add buffered entities:', error)
      }
    }

    if (this._pendingEntityAppends.length > 0) {
      this.scheduleEntityAppendDrain()
      return
    }

    this.resolveEntityAppendIdle()
  }

  private hasPendingEntityAppends() {
    return (
      this._pendingEntityAppends.length > 0 ||
      this._isEntityAppendDrainScheduled
    )
  }

  private resolveEntityAppendIdle() {
    if (this.hasPendingEntityAppends()) return

    const resolvers = this._entityAppendIdleResolvers.splice(0)
    resolvers.forEach(resolve => resolve())
  }
}
