import { AcDbSystemVariables, AcDbSysVarManager } from '@mlightcad/data-model'

import { AcEdBaseView } from '../view'

/**
 * Enumeration of cursor types available in the CAD editor.
 *
 * These cursor types provide visual feedback to users about the current
 * operation mode or expected input type. Each cursor has a specific
 * appearance and is used in different contexts.
 *
 * @example
 * ```typescript
 * // Set crosshair cursor for precise point input
 * editor.setCursor(AcEdCorsorType.Crosshair);
 *
 * // Set grab cursor for pan operations
 * editor.setCursor(AcEdCorsorType.Grab);
 *
 * // Restore default cursor
 * editor.setCursor(AcEdCorsorType.NoSpecialCursor);
 * ```
 */
export enum AcEdCorsorType {
  /** No special cursor - uses browser default */
  NoSpecialCursor = -1,
  /** Crosshair cursor for precise point selection */
  Crosshair = 0,
  /** Rectangle cursor for area selection */
  RectCursor,
  /** Rubber band cursor for dynamic drawing */
  RubberBand,
  /** Non-rotated cursor */
  NotRotated,
  /** Target box cursor for object snapping */
  TargetBox,
  /** Rotated crosshair cursor */
  RotatedCrosshair,
  /** Crosshair that doesn't rotate with view */
  CrosshairNoRotate,
  /** Invisible cursor for hiding cursor */
  Invisible,
  /** Entity selection cursor */
  EntitySelect,
  /** Parallelogram cursor for skewed operations */
  Parallelogram,
  /** Entity select cursor without perspective */
  EntitySelectNoPersp,
  /** Cursor for pick-first or grips operations */
  PkfirstOrGrips,
  /** Dashed crosshair cursor */
  CrosshairDashed,
  /** Grab/hand cursor for panning */
  Grab
}

/**
 * Manages cursor appearance and behavior for the CAD editor.
 *
 * This class creates and applies custom cursors to HTML elements,
 * providing visual feedback for different CAD operations. It supports
 * both built-in browser cursors and custom SVG-based cursors.
 *
 * The cursor manager maintains a cache of cursor definitions to avoid
 * recreating them repeatedly, improving performance.
 */
export class AcEdCursorManager {
  /** The view associated with the cursor manager */
  private _view: AcEdBaseView

  /** The current curos type in the associated view */
  private _currentCursor!: AcEdCorsorType

  /** Cache of cursor definitions mapped by cursor type */
  private _cursorMap: Map<AcEdCorsorType, string>
  /** The current background color */
  private _backgroundColor: number = 0
  /** Current crosshair line color */
  private _cursorColor: string = 'white'
  /** Pick box size in CSS pixels */
  private _pickBoxSize: number = 10
  /** DOM crosshair used for fine pointer devices */
  private _crosshairOverlay?: HTMLDivElement
  /** Latest pointer type seen over the canvas */
  private _lastPointerType: string = 'mouse'
  /** Whether the pointer is inside the canvas */
  private _isPointerInside = false
  /** Pending crosshair position update */
  private _crosshairRafId?: number
  private _pendingCrosshairPoint = { x: 0, y: 0 }
  /** Total length of the cursor crosshair */
  private readonly _totalLength: number = 20

  /**
   * Creates a new cursor manager instance.
   * Initializes the cursor and creates default cursor definitions.
   * @param view - The view associated with the cursor manager
   */
  constructor(view: AcEdBaseView) {
    this._view = view
    this._cursorMap = new Map()
    this.createCrosshairOverlay()
    this.bindCrosshairOverlayEvents()
    this.setCursorColor(this._backgroundColor === 0 ? 'white' : 'black')
    AcDbSysVarManager.instance().events.sysVarChanged.addEventListener(args => {
      if (args.name === AcDbSystemVariables.PICKBOX.toLowerCase()) {
        let size = args.newVal as number
        size = size >= 0 ? size : 0
        this._pickBoxSize = size
        this.refreshCrosshairCursor()
        this.setCursor(this._currentCursor)
      } else if (args.name === AcDbSystemVariables.WHITEBKCOLOR.toLowerCase()) {
        const useWhiteBackgroundColor = args.newVal as boolean
        this._backgroundColor = useWhiteBackgroundColor ? 0xffffff : 0
        this.setCursorColor(this._backgroundColor === 0 ? 'white' : 'black')
      }
    })
    this.setCursor(AcEdCorsorType.Crosshair)
  }

  /**
   * The current cursor type for the associated view.
   */
  get currentCursor() {
    return this._currentCursor
  }

  /**
   * Sets the current cursor for the associated view.
   *
   * @param cursorType - The type of cursor to set
   */
  setCursor(cursorType: AcEdCorsorType) {
    const element = this._view.canvas
    if (cursorType <= AcEdCorsorType.NoSpecialCursor) {
      element.style.cursor = 'default'
      this.setCrosshairOverlayVisible(false)
    } else if (cursorType == AcEdCorsorType.Grab) {
      element.style.cursor = 'grab'
      this.setCrosshairOverlayVisible(false)
    } else {
      const cursor = this._cursorMap.get(cursorType)
      if (cursorType === AcEdCorsorType.Crosshair) {
        const useOverlay = this.shouldUseOverlayCrosshair()
        element.style.cursor = useOverlay ? 'none' : (cursor ?? 'crosshair')
        this.setCrosshairOverlayVisible(useOverlay && this._isPointerInside)
      } else {
        this.setCrosshairOverlayVisible(false)
        if (cursor) {
          element.style.cursor = cursor
        }
      }
    }
    this._currentCursor = cursorType
  }

  /**
   * Sets the cursor color for the crosshair cursor
   *
   * @param color - The color for the cursor
   */
  setCursorColor(color: string) {
    this._cursorColor = color
    this.refreshCrosshairCursor()
    if (this._currentCursor === AcEdCorsorType.Crosshair) {
      this.setCursor(AcEdCorsorType.Crosshair)
    }
  }

  /**
   * Encodes an SVG string into a CSS cursor URL.
   *
   * This method converts SVG markup into a data URI that can be used
   * as a CSS cursor value, with specified hotspot coordinates.
   *
   * @param svgString - The SVG markup as a string
   * @param xOffset - X coordinate of the cursor hotspot
   * @param yOffset - Y coordinate of the cursor hotspot
   * @returns CSS cursor string in url() format
   *
   * @example
   * ```typescript
   * const svgCursor = '<svg width="20" height="20">...</svg>';
   * const cursorUrl = cursorManager.encodeSvgToCursor(svgCursor, 10, 10);
   * element.style.cursor = cursorUrl;
   * ```
   */
  encodeSvgToCursor(svgString: string, xOffset: number, yOffset: number) {
    return `url('data:image/svg+xml;base64,${btoa(svgString)}') ${xOffset} ${yOffset}, auto`
  }

  private refreshCrosshairCursor() {
    const cursor = this.createRectCrossIcon(
      this._pickBoxSize,
      Math.max(10, this._totalLength - this._pickBoxSize),
      this._cursorColor
    )
    this._cursorMap.set(AcEdCorsorType.Crosshair, cursor)
    this.updateCrosshairOverlayStyle()
  }

  private createCrosshairOverlay() {
    if (typeof document === 'undefined') return

    const overlay = document.createElement('div')
    overlay.className = 'ml-cad-modern-crosshair'
    overlay.setAttribute('aria-hidden', 'true')
    overlay.style.cssText = `
      position:absolute;
      inset:0;
      z-index:2;
      display:none;
      pointer-events:none;
      contain:layout paint;
      --ml-crosshair-x:0px;
      --ml-crosshair-y:0px;
      --ml-crosshair-box:10px;
      --ml-crosshair-half:5px;
      --ml-crosshair-color:#fff;
      --ml-crosshair-shadow:rgba(0,0,0,.72);
      --ml-crosshair-glow:rgba(64,158,255,.28);
    `
    overlay.innerHTML = `
      <span style="position:absolute;left:0;right:0;top:0;height:1px;background:var(--ml-crosshair-color);box-shadow:0 0 0 1px var(--ml-crosshair-shadow),0 0 10px var(--ml-crosshair-glow);opacity:.86;transform:translate3d(0,var(--ml-crosshair-y),0);"></span>
      <span style="position:absolute;top:0;bottom:0;left:0;width:1px;background:var(--ml-crosshair-color);box-shadow:0 0 0 1px var(--ml-crosshair-shadow),0 0 10px var(--ml-crosshair-glow);opacity:.86;transform:translate3d(var(--ml-crosshair-x),0,0);"></span>
      <span style="position:absolute;left:0;top:0;width:var(--ml-crosshair-box);height:var(--ml-crosshair-box);box-sizing:border-box;border:1px solid var(--ml-crosshair-color);border-radius:2px;box-shadow:0 0 0 1px var(--ml-crosshair-shadow),0 0 10px var(--ml-crosshair-glow);transform:translate3d(calc(var(--ml-crosshair-x) - var(--ml-crosshair-half)),calc(var(--ml-crosshair-y) - var(--ml-crosshair-half)),0);"></span>
      <span style="position:absolute;left:0;top:0;width:3px;height:3px;border-radius:50%;background:var(--ml-crosshair-color);box-shadow:0 0 0 1px var(--ml-crosshair-shadow);transform:translate3d(calc(var(--ml-crosshair-x) - 1px),calc(var(--ml-crosshair-y) - 1px),0);"></span>
    `

    this._view.container.appendChild(overlay)
    this._crosshairOverlay = overlay
  }

  private bindCrosshairOverlayEvents() {
    const canvas = this._view.canvas
    canvas.addEventListener('pointerenter', this.handlePointerEnter)
    canvas.addEventListener('pointerleave', this.handlePointerLeave)
    canvas.addEventListener('pointerdown', this.handlePointerMove, {
      passive: true
    })
    canvas.addEventListener('pointermove', this.handlePointerMove, {
      passive: true
    })
  }

  private handlePointerEnter = (event: PointerEvent) => {
    this._isPointerInside = true
    this.handlePointerMove(event)
  }

  private handlePointerLeave = () => {
    this._isPointerInside = false
    this.setCrosshairOverlayVisible(false)
  }

  private handlePointerMove = (event: PointerEvent) => {
    this._lastPointerType = event.pointerType || 'mouse'

    if (this._lastPointerType === 'touch') {
      this.setCrosshairOverlayVisible(false)
      return
    }

    this._isPointerInside = true

    if (this._currentCursor === AcEdCorsorType.Crosshair) {
      this.setCursor(AcEdCorsorType.Crosshair)
    }

    if (!this.shouldUseOverlayCrosshair()) return

    const point = this._view.viewportToCanvas({
      x: event.clientX,
      y: event.clientY
    })
    this._pendingCrosshairPoint = { x: point.x, y: point.y }
    this.scheduleCrosshairPositionUpdate()
  }

  private scheduleCrosshairPositionUpdate() {
    if (!this._crosshairOverlay || this._crosshairRafId != null) return

    const update = () => {
      this._crosshairRafId = undefined
      this._crosshairOverlay?.style.setProperty(
        '--ml-crosshair-x',
        `${this._pendingCrosshairPoint.x}px`
      )
      this._crosshairOverlay?.style.setProperty(
        '--ml-crosshair-y',
        `${this._pendingCrosshairPoint.y}px`
      )
    }

    if (
      typeof window !== 'undefined' &&
      typeof window.requestAnimationFrame === 'function'
    ) {
      this._crosshairRafId = window.requestAnimationFrame(update)
    } else {
      update()
    }
  }

  private shouldUseOverlayCrosshair() {
    if (!this._crosshairOverlay) return false
    if (this._lastPointerType === 'touch') return false
    if (this._lastPointerType === 'pen') return true
    if (typeof window === 'undefined' || !window.matchMedia) return true
    return window.matchMedia('(pointer: fine)').matches
  }

  private setCrosshairOverlayVisible(visible: boolean) {
    if (!this._crosshairOverlay) return
    this._crosshairOverlay.style.display = visible ? 'block' : 'none'
  }

  private updateCrosshairOverlayStyle() {
    if (!this._crosshairOverlay) return
    const color = this._cursorColor === 'white' ? '#ffffff' : '#111827'
    const shadow =
      this._cursorColor === 'white' ? 'rgba(0,0,0,.72)' : 'rgba(255,255,255,.9)'
    const boxSize = Math.max(6, this._pickBoxSize)

    this._crosshairOverlay.style.setProperty('--ml-crosshair-color', color)
    this._crosshairOverlay.style.setProperty('--ml-crosshair-shadow', shadow)
    this._crosshairOverlay.style.setProperty(
      '--ml-crosshair-box',
      `${boxSize}px`
    )
    this._crosshairOverlay.style.setProperty(
      '--ml-crosshair-half',
      `${boxSize / 2}px`
    )
  }

  /**
   * Create one svg icon with one rectangle plus two cross lines
   * @param rectSize Input the width and height of rectangle
   * @param crossLineLength Input the length of one cross line
   * @param lineColor Input line color
   * @returns Return svg string of the icon
   */
  private createRectCrossIcon(
    rectSize: number,
    lineLength: number,
    lineColor: string = 'white'
  ) {
    const boxSize = Math.max(6, rectSize)
    const halfSize = boxSize / 2
    const svgSize = Math.max(32, boxSize + 2 * lineLength)
    const center = svgSize / 2
    const gap = Math.max(halfSize + 3, 8)
    const color = lineColor === 'white' ? '#ffffff' : '#111827'
    const shadow = lineColor === 'white' ? '#000000' : '#ffffff'
    const svg = `
      <svg xmlns="http://www.w3.org/2000/svg" width="${svgSize}" height="${svgSize}" viewBox="0 0 ${svgSize} ${svgSize}">
        <g fill="none" stroke="${shadow}" stroke-width="3" stroke-linecap="round" opacity=".72">
          <path d="M ${center} 1 L ${center} ${center - gap} M ${center} ${center + gap} L ${center} ${svgSize - 1} M 1 ${center} L ${center - gap} ${center} M ${center + gap} ${center} L ${svgSize - 1} ${center}" />
          <rect x="${center - halfSize}" y="${center - halfSize}" width="${boxSize}" height="${boxSize}" rx="2" />
        </g>
        <g fill="none" stroke="${color}" stroke-width="1.4" stroke-linecap="round">
          <path d="M ${center} 1 L ${center} ${center - gap} M ${center} ${center + gap} L ${center} ${svgSize - 1} M 1 ${center} L ${center - gap} ${center} M ${center + gap} ${center} L ${svgSize - 1} ${center}" />
          <rect x="${center - halfSize}" y="${center - halfSize}" width="${boxSize}" height="${boxSize}" rx="2" />
        </g>
        <circle cx="${center}" cy="${center}" r="1.25" fill="${color}" stroke="${shadow}" stroke-width=".75" />
      </svg>
    `
    return this.encodeSvgToCursor(svg, center, center)
  }
}
