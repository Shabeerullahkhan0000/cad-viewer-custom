import { AcApSettingManager, AcApSettings } from '@mlightcad/cad-simple-viewer'
import { onScopeDispose, reactive } from 'vue'

export function useSettings() {
  const manager = AcApSettingManager.instance
  const settings = reactive<AcApSettings>(manager.settings)

  const handleModified = (args: { key: string; value: unknown }) => {
    // @ts-expect-error Hard to describe its type
    settings[args.key] = args.value
  }

  manager.events.modified.addEventListener(handleModified)

  onScopeDispose(() => {
    manager.events.modified.removeEventListener(handleModified)
  })

  return settings
}
