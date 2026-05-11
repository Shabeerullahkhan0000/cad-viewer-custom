import 'element-plus/dist/index.css'
import '../style/style.css'
import '../style/index.scss'

import {
  AcApDocManager,
  AcApDocManagerOptions
} from '@mlightcad/cad-simple-viewer'

export interface InitializeCadViewerOptions extends AcApDocManagerOptions {
  uiMode?: 'full' | 'compact'
}

export const initializeCadViewer = async ({
  uiMode = 'full',
  ...options
}: InitializeCadViewerOptions = {}) => {
  AcApDocManager.createInstance(options)

  if (uiMode === 'compact') return

  const { registerCmds, registerDialogs, registerMTextColorPicker } =
    await import('./register')
  registerCmds()
  registerDialogs()
  registerMTextColorPicker()
}
