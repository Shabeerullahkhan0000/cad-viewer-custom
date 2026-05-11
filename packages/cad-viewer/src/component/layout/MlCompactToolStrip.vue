<template>
  <div
    ref="compactToolsRef"
    class="ml-compact-tools"
    aria-label="Drawing tools"
  >
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
        @pointerdown.stop
      >
        <button
          v-for="item in measurementItems"
          :key="item.command"
          :aria-label="item.label"
          :class="`is-${item.variant}`"
          :title="item.label"
          class="ml-compact-tools__measure-button"
          role="menuitem"
          type="button"
          @click="runCommand(item.command)"
        >
          <span class="ml-compact-tools__measure-icon-shell">
            <component :is="item.icon" class="ml-compact-tools__icon" />
          </span>
          <span class="ml-compact-tools__measure-label">
            {{ item.shortLabel }}
          </span>
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
const compactToolsRef = ref<HTMLElement | null>(null)

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
    shortLabel: t('main.compactTools.distanceShort'),
    variant: 'distance'
  },
  {
    command: 'measurearea',
    icon: MeasureAreaIcon,
    label: t('main.compactTools.area'),
    shortLabel: t('main.compactTools.areaShort'),
    variant: 'area'
  },
  {
    command: 'measureangle',
    icon: MeasureAngleIcon,
    label: t('main.compactTools.angle'),
    shortLabel: t('main.compactTools.angleShort'),
    variant: 'angle'
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

const handleDocumentPointerDown = (event: PointerEvent) => {
  if (!isMeasurementMenuOpen.value) return
  const target = event.target
  if (target instanceof Node && compactToolsRef.value?.contains(target)) return
  isMeasurementMenuOpen.value = false
}

onMounted(() => {
  document.addEventListener('fullscreenchange', updateFullscreenState)
  document.addEventListener('keydown', handleKeydown)
  document.addEventListener('pointerdown', handleDocumentPointerDown, true)
  updateFullscreenState()
})

onUnmounted(() => {
  document.removeEventListener('fullscreenchange', updateFullscreenState)
  document.removeEventListener('keydown', handleKeydown)
  document.removeEventListener('pointerdown', handleDocumentPointerDown, true)
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
  gap: 10px;
  width: min(330px, calc(100vw - 110px));
  box-sizing: border-box;
  padding: 10px;
  background:
    linear-gradient(
      180deg,
      color-mix(in srgb, var(--el-bg-color) 98%, transparent),
      color-mix(in srgb, var(--el-fill-color-light) 92%, transparent)
    );
  border: 1px solid
    color-mix(in srgb, var(--el-border-color-light) 76%, transparent);
  border-radius: 8px;
  box-shadow:
    0 18px 44px rgba(15, 23, 42, 0.2),
    inset 0 1px 0 color-mix(in srgb, #fff 48%, transparent);
  backdrop-filter: blur(18px);
  animation: ml-measure-menu-in 140ms ease-out;
}

.ml-compact-tools__measure-button {
  --measure-accent: var(--el-color-primary);
  position: relative;
  flex-direction: column;
  gap: 7px;
  min-width: 0;
  height: 68px;
  padding: 9px 8px 8px;
  overflow: hidden;
  color: var(--el-text-color-primary);
  background:
    linear-gradient(
      180deg,
      color-mix(in srgb, var(--el-bg-color) 99%, transparent),
      color-mix(in srgb, var(--measure-accent) 8%, var(--el-bg-color))
    );
  border-color: color-mix(
    in srgb,
    var(--measure-accent) 28%,
    var(--el-border-color)
  );
  white-space: nowrap;
  box-shadow: 0 8px 22px rgba(15, 23, 42, 0.08);
  transition:
    color 120ms ease,
    border-color 120ms ease,
    background 120ms ease,
    box-shadow 120ms ease,
    transform 120ms ease;
}

.ml-compact-tools__measure-button::before {
  position: absolute;
  top: 0;
  left: 10px;
  right: 10px;
  height: 3px;
  content: '';
  background: var(--measure-accent);
  border-radius: 0 0 8px 8px;
  opacity: 0.9;
}

.ml-compact-tools__measure-button.is-distance {
  --measure-accent: #2563eb;
}

.ml-compact-tools__measure-button.is-area {
  --measure-accent: #059669;
}

.ml-compact-tools__measure-button.is-angle {
  --measure-accent: #d97706;
}

.ml-compact-tools__measure-button:hover,
.ml-compact-tools__measure-button:focus-visible {
  color: color-mix(
    in srgb,
    var(--measure-accent) 86%,
    var(--el-text-color-primary)
  );
  border-color: color-mix(
    in srgb,
    var(--measure-accent) 66%,
    var(--el-border-color)
  );
  background:
    linear-gradient(
      180deg,
      color-mix(in srgb, var(--measure-accent) 10%, var(--el-bg-color)),
      color-mix(in srgb, var(--measure-accent) 16%, var(--el-bg-color))
    );
  box-shadow:
    0 12px 28px rgba(15, 23, 42, 0.14),
    0 0 0 3px color-mix(in srgb, var(--measure-accent) 16%, transparent);
  transform: translateY(-1px);
}

.ml-compact-tools__measure-icon-shell {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 30px;
  height: 30px;
  color: var(--measure-accent);
  background: color-mix(
    in srgb,
    var(--measure-accent) 12%,
    var(--el-bg-color)
  );
  border: 1px solid color-mix(in srgb, var(--measure-accent) 22%, transparent);
  border-radius: 8px;
}

.ml-compact-tools__measure-icon-shell .ml-compact-tools__icon {
  width: 19px;
  height: 19px;
}

.ml-compact-tools__measure-label {
  max-width: 100%;
  overflow: hidden;
  color: inherit;
  font-size: 12px;
  font-weight: 700;
  line-height: 1.1;
  text-overflow: ellipsis;
}

@keyframes ml-measure-menu-in {
  from {
    opacity: 0;
    transform: translate3d(6px, 0, 0) scale(0.98);
  }

  to {
    opacity: 1;
    transform: translate3d(0, 0, 0) scale(1);
  }
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

  .ml-compact-tools__measure-wrap {
    display: contents;
  }

  .ml-compact-tools__button {
    width: 100%;
    min-width: 0;
    height: 48px;
  }

  .ml-compact-tools__measure-menu {
    top: auto;
    right: auto;
    bottom: calc(100% + 12px);
    left: 0;
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    width: 100%;
    box-sizing: border-box;
    gap: 9px;
    padding: 10px;
    box-shadow:
      0 16px 40px rgba(15, 23, 42, 0.22),
      inset 0 1px 0 color-mix(in srgb, #fff 48%, transparent);
    animation-name: ml-measure-menu-up;
  }

  .ml-compact-tools__measure-button {
    min-width: 0;
    width: 100%;
    height: 76px;
    padding: 11px 6px 9px;
  }

  .ml-compact-tools__measure-icon-shell {
    width: 34px;
    height: 34px;
  }

  .ml-compact-tools__measure-icon-shell .ml-compact-tools__icon {
    width: 21px;
    height: 21px;
  }

  .ml-compact-tools__measure-label {
    font-size: 12px;
  }

  @keyframes ml-measure-menu-up {
    from {
      opacity: 0;
      transform: translate3d(0, 8px, 0) scale(0.98);
    }

    to {
      opacity: 1;
      transform: translate3d(0, 0, 0) scale(1);
    }
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

  .ml-compact-tools__measure-label {
    font-size: 11px;
  }
}

@media (max-width: 340px) {
  .ml-compact-tools__measure-menu {
    gap: 6px;
    padding: 8px;
  }

  .ml-compact-tools__measure-button {
    height: 68px;
  }

  .ml-compact-tools__measure-icon-shell {
    width: 30px;
    height: 30px;
  }
}

@media (prefers-reduced-motion: reduce) {
  .ml-compact-tools__measure-menu {
    animation: none;
  }

  .ml-compact-tools__measure-button {
    transition: none;
  }

  .ml-compact-tools__measure-button:hover,
  .ml-compact-tools__measure-button:focus-visible {
    transform: none;
  }
}
</style>
