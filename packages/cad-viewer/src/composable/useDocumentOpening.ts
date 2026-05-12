import {
  AcApDocManager,
  addEventBusListener
} from '@mlightcad/cad-simple-viewer'
import { onMounted, onUnmounted, readonly, ref } from 'vue'

const isDocumentOpening = ref(false)

let isBound = false
let retryTimer: ReturnType<typeof setInterval> | undefined
let activeConsumers = 0
let boundDocManager: AcApDocManager | null = null
let removeFailedToOpenListener: (() => void) | undefined

function getExistingDocManager(): AcApDocManager | null {
  const singleton = AcApDocManager as unknown as {
    _instance?: AcApDocManager
  }
  return singleton._instance ?? null
}

function stopRetryTimer() {
  if (!retryTimer) return
  clearInterval(retryTimer)
  retryTimer = undefined
}

function beginDocumentOpening() {
  isDocumentOpening.value = true
}

function endDocumentOpening() {
  isDocumentOpening.value = false
}

function tryBind() {
  if (isBound) return true

  const docManager = getExistingDocManager()
  if (!docManager) return false

  docManager.events.documentToBeOpened.addEventListener(beginDocumentOpening)
  docManager.events.documentActivated.addEventListener(endDocumentOpening)
  removeFailedToOpenListener = addEventBusListener(
    'failed-to-open-file',
    endDocumentOpening
  )

  boundDocManager = docManager
  isBound = true
  stopRetryTimer()
  return true
}

function unbind() {
  stopRetryTimer()
  if (boundDocManager) {
    boundDocManager.events.documentToBeOpened.removeEventListener(
      beginDocumentOpening
    )
    boundDocManager.events.documentActivated.removeEventListener(
      endDocumentOpening
    )
  }
  removeFailedToOpenListener?.()
  removeFailedToOpenListener = undefined
  boundDocManager = null
  isBound = false
}

function ensureDocumentOpeningSync() {
  if (tryBind() || retryTimer) return

  retryTimer = setInterval(() => {
    tryBind()
  }, 50)
}

export function useDocumentOpening() {
  onMounted(() => {
    activeConsumers++
    ensureDocumentOpeningSync()
  })

  onUnmounted(() => {
    activeConsumers = Math.max(0, activeConsumers - 1)
    if (activeConsumers === 0) {
      unbind()
    }
  })

  return {
    isDocumentOpening: readonly(isDocumentOpening),
    beginDocumentOpening,
    endDocumentOpening
  }
}
