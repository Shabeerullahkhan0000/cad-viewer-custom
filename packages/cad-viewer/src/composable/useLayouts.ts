import {
  AcApDocManager,
  AcDbDocumentEventArgs,
  isEventBusBulkLoading
} from '@mlightcad/cad-simple-viewer'
import {
  AcDbDatabase,
  acdbHostApplicationServices,
  AcDbObjectId
} from '@mlightcad/data-model'
import { onScopeDispose, reactive } from 'vue'

const getIsMobile = () => {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return false
  }

  const isMobile = window.matchMedia('(pointer: coarse)').matches
  return isMobile
}

export interface LayoutInfo {
  name: string
  tabOrder: number
  blockTableRecordId: AcDbObjectId
  isActive: boolean
}

export function useLayouts(editor: AcApDocManager) {
  const reactiveLayouts = reactive<LayoutInfo[]>([])
  const isMobile = getIsMobile()
  const doc = editor.curDocument
  let hasBufferedLayoutSwitch = false
  let bufferedActiveLayoutName: string | undefined
  const shouldBufferBulkLoadEvents = () =>
    isMobile && isEventBusBulkLoading()

  const reset = (doc: AcDbDatabase) => {
    const layouts = doc.objects.layout.newIterator()
    reactiveLayouts.length = 0
    for (const layout of layouts) {
      reactiveLayouts.push({
        name: layout.layoutName,
        tabOrder: layout.tabOrder,
        blockTableRecordId: layout.blockTableRecordId,
        isActive: layout.blockTableRecordId == doc.currentSpaceId
      })
    }
    reactiveLayouts.sort((a, b) => a.tabOrder - b.tabOrder)
  }
  reset(doc.database)

  const applyActiveLayout = (layoutName: string) => {
    reactiveLayouts.forEach(layout => {
      layout.isActive = layout.name == layoutName
    })
  }

  const handleDocumentActivated = (args: AcDbDocumentEventArgs) => {
    reactiveLayouts.length = 0
    reset(args.doc.database)
    if (hasBufferedLayoutSwitch && bufferedActiveLayoutName) {
      applyActiveLayout(bufferedActiveLayoutName)
    }
    hasBufferedLayoutSwitch = false
    bufferedActiveLayoutName = undefined
  }

  const handleLayoutSwitched = (args: { layout: { layoutName: string } }) => {
    const newLayout = args.layout
    if (shouldBufferBulkLoadEvents()) {
      hasBufferedLayoutSwitch = true
      bufferedActiveLayoutName = newLayout.layoutName
      return
    }

    applyActiveLayout(newLayout.layoutName)
  }

  editor.events.documentActivated.addEventListener(handleDocumentActivated)

  acdbHostApplicationServices().layoutManager.events.layoutSwitched.addEventListener(
    handleLayoutSwitched
  )

  onScopeDispose(() => {
    editor.events.documentActivated.removeEventListener(handleDocumentActivated)
    acdbHostApplicationServices().layoutManager.events.layoutSwitched.removeEventListener(
      handleLayoutSwitched
    )
  })

  return reactiveLayouts
}
