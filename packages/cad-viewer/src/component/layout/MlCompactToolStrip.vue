<template>
  <div class="ml-compact-tools" aria-label="Drawing tools">
    <div class="ml-compact-tools__measure-wrap">
      <button
        :aria-expanded="isMeasurementMenuOpen"
        :aria-label="t('main.compactTools.measure')"
        :class="{ 'is-active': isMeasurementMenuOpen }"
        :disabled="isDocumentOpening"
        :title="t('main.compactTools.measure')"
        class="ml-compact-tools__button"
        type="button"
        @click="toggleMeasurementMenu"
      >
        <MeasureIcon class="ml-compact-tools__icon" />
      </button>

      <div
        v-if="isMeasurementMenuOpen"
        class="ml-compact-tools__measure-menu"
        role="menu"
      >
        <button
          v-for="item in measurementItems"
          :key="item.command"
          :aria-label="item.label"
          :title="item.label"
          class="ml-compact-tools__measure-button"
          role="menuitem"
          type="button"
          @click="runCommand(item.command)"
        >
          <component :is="item.icon" class="ml-compact-tools__icon" />
          <span>{{ item.shortLabel }}</span>
        </button>
      </div>
    </div>

    <button
      :aria-label="t('main.compactTools.fullscreen')"
      :disabled="isDocumentOpening"
      :title="t('main.compactTools.fullscreen')"
      class="ml-compact-tools__button"
      type="button"
      @click="toggleFullscreen"
    >
      <FullScreen class="ml-compact-tools__icon" />
    </button>

    <button
      :aria-label="t('main.compactTools.fit')"
      :disabled="isDocumentOpening"
      :title="t('main.compactTools.fit')"
      class="ml-compact-tools__button"
      type="button"
      @click="runCommand('zoom\\nall')"
    >
      <ZoomToExtentIcon class="ml-compact-tools__icon" />
    </button>

    <button
      :aria-label="snapTooltip"
      :class="{ 'is-active': isSnapEnabled }"
      :disabled="isDocumentOpening"
      :title="snapTooltip"
      class="ml-compact-tools__button"
      type="button"
      @click="toggleSnaps"
    >
      <Magnet class="ml-compact-tools__icon" />
    </button>

    <button
      :aria-label="themeTooltip"
      :title="themeTooltip"
      class="ml-compact-tools__button"
      type="button"
      @click="toggleDark"
    >
      <Moon v-if="isDark" class="ml-compact-tools__icon" />
      <Sunny v-else class="ml-compact-tools__icon" />
    </button>
  </div>
</template>

<script setup lang="ts">
import {
  FullScreen,
  Magnet,
  Moon,
  Sunny
} from '@element-plus/icons-vue'
import {
  AcApDocManager,
  AcApSettingManager
} from '@mlightcad/cad-simple-viewer'
import { AcDbOsnapMode, acdbOsnapModesToMask } from '@mlightcad/data-model'
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'

import { isDark, toggleDark } from '../../composable/useDark'
import { useDocumentOpening } from '../../composable/useDocumentOpening'
import { useSettings } from '../../composable/useSettings'
import MeasureIcon from '../../svg/measure/measure.svg'
import MeasureAngleIcon from '../../svg/measure/measureAngle.svg'
import MeasureAreaIcon from '../../svg/measure/measureArea.svg'
import MeasureDistanceIcon from '../../svg/measure/measureDistance.svg'
import ZoomToExtentIcon from '../../svg/zoomToExtent.svg'

const { t } = useI18n()
const features = useSettings()
const { isDocumentOpening } = useDocumentOpening()
const isMeasurementMenuOpen = ref(false)
const isFullscreen = ref(false)
const lastSnapModes = ref(features.osnapModes)

const defaultSnapModes = acdbOsnapModesToMask([
  AcDbOsnapMode.EndPoint,
  AcDbOsnapMode.MidPoint,
  AcDbOsnapMode.Center,
  AcDbOsnapMode.Quadrant,
  AcDbOsnapMode.Nearest
])

const measurementItems = computed(() => [
  {
    command: 'measuredistance',
    icon: MeasureDistanceIcon,
    label: t('main.compactTools.distance'),
    shortLabel: t('main.compactTools.distanceShort')
  },
  {
    command: 'measurearea',
    icon: MeasureAreaIcon,
    label: t('main.compactTools.area'),
    shortLabel: t('main.compactTools.areaShort')
  },
  {
    command: 'measureangle',
    icon: MeasureAngleIcon,
    label: t('main.compactTools.angle'),
    shortLabel: t('main.compactTools.angleShort')
  }
])

const isSnapEnabled = computed(() => features.osnapModes !== 0)
const snapTooltip = computed(() =>
  isSnapEnabled.value
    ? t('main.compactTools.snapsOn')
    : t('main.compactTools.snapsOff')
)
const themeTooltip = computed(() =>
  isDark.value
    ? t('main.compactTools.lightTheme')
    : t('main.compactTools.darkTheme')
)

const updateFullscreenState = () => {
  isFullscreen.value = Boolean(document.fullscreenElement)
}

const toggleMeasurementMenu = () => {
  if (isDocumentOpening.value) return
  isMeasurementMenuOpen.value = !isMeasurementMenuOpen.value
}

const runCommand = (command: string) => {
  if (isDocumentOpening.value) return
  isMeasurementMenuOpen.value = false
  AcApDocManager.instance.sendStringToExecute(command)
}

const toggleFullscreen = async () => {
  if (isDocumentOpening.value) return
  if (document.fullscreenElement) {
    await document.exitFullscreen()
  } else {
    await document.documentElement.requestFullscreen()
  }
  updateFullscreenState()
}

const toggleSnaps = () => {
  if (isDocumentOpening.value) return

  if (features.osnapModes !== 0) {
    lastSnapModes.value = features.osnapModes
    AcApSettingManager.instance.osnapModes = 0
    features.osnapModes = 0
    return
  }

  const restoredModes = lastSnapModes.value || defaultSnapModes
  AcApSettingManager.instance.osnapModes = restoredModes
  features.osnapModes = restoredModes
}

const handleKeydown = (event: KeyboardEvent) => {
  if (event.key === 'Escape') {
    isMeasurementMenuOpen.value = false
  }
}

onMounted(() => {
  document.addEventListener('fullscreenchange', updateFullscreenState)
  document.addEventListener('keydown', handleKeydown)
  updateFullscreenState()
})

onUnmounted(() => {
  document.removeEventListener('fullscreenchange', updateFullscreenState)
  document.removeEventListener('keydown', handleKeydown)
})
</script>

<style scoped>
.ml-compact-tools {
  position: fixed;
  right: max(18px, env(safe-area-inset-right));
  top: 50%;
  z-index: 5;
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 8px;
  background: color-mix(in srgb, var(--el-bg-color) 90%, transparent);
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 8px;
  box-shadow: 0 12px 36px rgba(15, 23, 42, 0.16);
  transform: translateY(-50%);
  backdrop-filter: blur(12px);
}

.ml-compact-tools__measure-wrap {
  position: relative;
}

.ml-compact-tools__button,
.ml-compact-tools__measure-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  box-sizing: border-box;
  min-width: 44px;
  height: 44px;
  color: var(--el-text-color-primary);
  background: var(--el-fill-color-blank);
  border: 1px solid var(--el-border-color);
  border-radius: 7px;
  cursor: pointer;
  font: inherit;
  -webkit-tap-highlight-color: transparent;
  touch-action: manipulation;
}

.ml-compact-tools__button:hover,
.ml-compact-tools__button.is-active,
.ml-compact-tools__measure-button:hover {
  color: var(--el-color-primary);
  border-color: var(--el-color-primary-light-5);
  background: var(--el-color-primary-light-9);
}

.ml-compact-tools__button:disabled {
  cursor: default;
  opacity: 0.55;
}

.ml-compact-tools__icon {
  width: 18px;
  height: 18px;
  flex: 0 0 auto;
}

.ml-compact-tools__measure-menu {
  position: absolute;
  top: 0;
  right: calc(100% + 10px);
  display: grid;
  grid-template-columns: repeat(3, minmax(74px, 1fr));
  gap: 8px;
  width: min(304px, calc(100vw - 110px));
  box-sizing: border-box;
  padding: 8px;
  background: color-mix(in srgb, var(--el-bg-color) 94%, transparent);
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 8px;
  box-shadow: 0 12px 36px rgba(15, 23, 42, 0.16);
  backdrop-filter: blur(12px);
}

.ml-compact-tools__measure-button {
  gap: 7px;
  min-width: 0;
  padding: 0 12px;
  white-space: nowrap;
}

.ml-compact-tools__measure-button span {
  font-size: 12px;
  font-weight: 600;
}

@media (max-width: 900px), (max-height: 560px), (pointer: coarse) {
  .ml-compact-tools {
    right: max(10px, env(safe-area-inset-right));
    bottom: max(10px, env(safe-area-inset-bottom));
    left: max(10px, env(safe-area-inset-left));
    top: auto;
    display: grid;
    grid-template-columns: repeat(5, minmax(0, 1fr));
    gap: 8px;
    padding: 8px;
    transform: none;
  }

  .ml-compact-tools__button {
    width: 100%;
    min-width: 0;
    height: 48px;
  }

  .ml-compact-tools__measure-menu {
    top: auto;
    right: auto;
    bottom: calc(100% + 10px);
    left: 0;
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    width: 100%;
    box-sizing: border-box;
  }

  .ml-compact-tools__measure-button {
    min-width: 0;
    width: 100%;
    height: 48px;
    padding: 0 8px;
  }
}

@media (max-width: 420px) {
  .ml-compact-tools {
    gap: 6px;
    padding: 6px;
  }

  .ml-compact-tools__button {
    height: 46px;
  }

  .ml-compact-tools__measure-button span {
    font-size: 11px;
  }
}

@media (max-width: 340px) {
  .ml-compact-tools__measure-menu {
    grid-template-columns: 1fr;
  }

  .ml-compact-tools__measure-button {
    justify-content: flex-start;
  }
}
</style>
