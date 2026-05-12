import {
  AcApDocManager,
  AcApSettingManager,
  addEventBusListener
} from '@mlightcad/cad-simple-viewer'
import { AcDbObjectId } from '@mlightcad/data-model'
import { onMounted, onUnmounted, reactive } from 'vue'

export interface ImageMappingData {
  fileName: string
  file?: File
  ids: Set<AcDbObjectId>
}

export function useMissedData() {
  const fontMapping = reactive(new Map<string, string>())
  const imageData = reactive(new Map<string, ImageMappingData>())

  const reset = () => {
    const missedData = AcApDocManager.instance.curView.missedData
    const storedFontMapping = AcApSettingManager.instance.fontMapping

    fontMapping.clear()
    Object.keys(missedData.fonts).forEach(key => {
      const mappedFont = storedFontMapping[key]
      fontMapping.set(key, mappedFont || '')
    })

    imageData.clear()
    missedData.images.forEach((value, key) => {
      const item = imageData.get(value)
      if (item) {
        item.ids.add(key)
      } else {
        imageData.set(value, {
          fileName: value,
          ids: new Set([key])
        })
      }
    })
  }

  let removeFontNotFoundListener: (() => void) | undefined
  const handleDocumentActivated = () => reset()
  const handleFontNotFound = () => reset()

  onMounted(() => {
    AcApDocManager.instance.events.documentActivated.addEventListener(
      handleDocumentActivated
    )
    removeFontNotFoundListener = addEventBusListener(
      'font-not-found',
      handleFontNotFound
    )
    reset()
  })

  onUnmounted(() => {
    AcApDocManager.instance.events.documentActivated.removeEventListener(
      handleDocumentActivated
    )
    removeFontNotFoundListener?.()
    removeFontNotFoundListener = undefined
  })

  return {
    fonts: fontMapping,
    images: imageData
  }
}
