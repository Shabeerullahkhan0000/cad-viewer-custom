import {
  AcApDocManager,
  type AcDbDocumentEventArgs
} from '@mlightcad/cad-simple-viewer'
import {
  type AcDbColorTheme,
  AcDbDatabase,
  AcDbSystemVariables,
  type AcDbSysVarEventArgs,
  AcDbSysVarManager
} from '@mlightcad/data-model'
import { computed, ref } from 'vue'

import {
  getColorThemeFromDatabase,
  setColorThemeForDatabase
} from './useSystemVars'

const currentTheme = ref<AcDbColorTheme>('dark')
let isThemeSyncInitialized = false
let syncedDocManager: AcApDocManager | null = null

function applyThemeToDom(theme: AcDbColorTheme) {
  if (typeof document === 'undefined') return

  const html = document.documentElement
  html.classList.toggle('dark', theme === 'dark')
}

function updateCurrentTheme(theme: AcDbColorTheme) {
  currentTheme.value = theme
  applyThemeToDom(theme)
}

function getExistingDocManager(): AcApDocManager | null {
  const singleton = AcApDocManager as unknown as {
    _instance?: AcApDocManager
  }
  return singleton._instance ?? null
}

function getCurrentDatabase(): AcDbDatabase | null {
  return getExistingDocManager()?.curDocument?.database ?? null
}

function syncThemeFromDatabase(database: AcDbDatabase | null) {
  if (!database) return
  updateCurrentTheme(getColorThemeFromDatabase(database))
}

function handleColorThemeSysVarChanged(args: AcDbSysVarEventArgs) {
  if (args.name.toLowerCase() !== AcDbSystemVariables.COLORTHEME.toLowerCase()) {
    return
  }
  updateCurrentTheme(getColorThemeFromDatabase(args.database))
}

function handleColorThemeDocumentActivated(args: AcDbDocumentEventArgs) {
  syncThemeFromDatabase(args.doc.database)
}

export function disposeColorThemeSync() {
  AcDbSysVarManager.instance().events.sysVarChanged.removeEventListener(
    handleColorThemeSysVarChanged
  )
  syncedDocManager?.events.documentActivated.removeEventListener(
    handleColorThemeDocumentActivated
  )
  syncedDocManager = null
  isThemeSyncInitialized = false
}

export function ensureColorThemeSync() {
  const docManager = getExistingDocManager()
  if (!docManager) return

  if (isThemeSyncInitialized && syncedDocManager === docManager) return
  if (syncedDocManager && syncedDocManager !== docManager) {
    disposeColorThemeSync()
  }

  isThemeSyncInitialized = true
  syncedDocManager = docManager
  syncThemeFromDatabase(getCurrentDatabase())

  AcDbSysVarManager.instance().events.sysVarChanged.addEventListener(
    handleColorThemeSysVarChanged
  )

  docManager.events.documentActivated.addEventListener(
    handleColorThemeDocumentActivated
  )
}

export function setColorTheme(
  theme: AcDbColorTheme,
  database?: AcDbDatabase | null
) {
  updateCurrentTheme(theme)

  ensureColorThemeSync()

  const targetDatabase = database ?? getCurrentDatabase()
  if (!targetDatabase) return

  if (getColorThemeFromDatabase(targetDatabase) === theme) return
  setColorThemeForDatabase(targetDatabase, theme)
}

export const isDark = computed<boolean>({
  get: () => currentTheme.value === 'dark',
  set: value => {
    setColorTheme(value ? 'dark' : 'light')
  }
})

export const toggleDark = () => {
  setColorTheme(isDark.value ? 'light' : 'dark')
}

applyThemeToDom(currentTheme.value)
