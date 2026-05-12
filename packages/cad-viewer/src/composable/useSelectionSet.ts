import {
  AcApDocManager,
  AcDbDocumentEventArgs,
  isEventBusBulkLoading,
  AcEdSelectionEventArgs
} from '@mlightcad/cad-simple-viewer'
import { AcDbObjectId } from '@mlightcad/data-model'
import { onMounted, onUnmounted, ref } from 'vue'

const getIsMobile = () => {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return false
  }

  const isMobile = window.matchMedia('(pointer: coarse)').matches
  return isMobile
}

export function useSelectionSet() {
  const selectionSet = ref<AcDbObjectId[]>([])
  const added = ref<AcDbObjectId[]>([])
  const removed = ref<AcDbObjectId[]>([])
  const isMobile = getIsMobile()
  let bufferedAdded: AcDbObjectId[] = []
  let bufferedRemoved: AcDbObjectId[] = []
  let hasBufferedSelectionEvents = false

  const shouldBufferBulkLoadEvents = () =>
    isMobile && isEventBusBulkLoading()

  const flushSelectionSet = () => {
    if (hasBufferedSelectionEvents) {
      added.value = bufferedAdded
      removed.value = bufferedRemoved
    }
    selectionSet.value = AcApDocManager.instance.curView.selectionSet.ids
    bufferedAdded = []
    bufferedRemoved = []
    hasBufferedSelectionEvents = false
  }

  const selectionAdded = (args: AcEdSelectionEventArgs) => {
    if (shouldBufferBulkLoadEvents()) {
      bufferedAdded = args.ids
      hasBufferedSelectionEvents = true
      return
    }

    added.value = args.ids
    selectionSet.value = AcApDocManager.instance.curView.selectionSet.ids
  }

  const selectionRemoved = (args: AcEdSelectionEventArgs) => {
    if (shouldBufferBulkLoadEvents()) {
      bufferedRemoved = args.ids
      hasBufferedSelectionEvents = true
      return
    }

    removed.value = args.ids
    selectionSet.value = AcApDocManager.instance.curView.selectionSet.ids
  }

  const documentActivated = (_args: AcDbDocumentEventArgs) => {
    flushSelectionSet()
  }

  /** Register event listeners when the component mounts */
  onMounted(() => {
    const events = AcApDocManager.instance.curView.selectionSet.events
    events.selectionAdded.addEventListener(selectionAdded)
    events.selectionRemoved.addEventListener(selectionRemoved)
    AcApDocManager.instance.events.documentActivated.addEventListener(
      documentActivated
    )
  })

  /** Unregister event listeners when the component unmounts */
  onUnmounted(() => {
    const events = AcApDocManager.instance.curView.selectionSet.events
    events.selectionAdded.removeEventListener(selectionAdded)
    events.selectionRemoved.removeEventListener(selectionRemoved)
    AcApDocManager.instance.events.documentActivated.removeEventListener(
      documentActivated
    )
  })

  return {
    selectionSet,
    added,
    removed
  }
}
