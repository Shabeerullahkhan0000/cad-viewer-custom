import { AcDbDatabaseConverterManager } from '@mlightcad/data-model'
import { onScopeDispose, ref } from 'vue'

export function useFileTypes() {
  const fileTypes = ref<Set<string>>(new Set())
  const register = AcDbDatabaseConverterManager.instance
  for (const item of register.fileTypes) {
    fileTypes.value.add(item)
  }

  const handleRegistered = (args: { fileType: string }) => {
    fileTypes.value.add(args.fileType)
  }

  register.events.registered.addEventListener(handleRegistered)

  onScopeDispose(() => {
    register.events.registered.removeEventListener(handleRegistered)
  })

  return fileTypes
}
