<template>
  <div class="ml-drawing-loading-overlay" role="status" aria-live="polite">
    <div class="ml-drawing-loading-overlay__content">
      <div class="ml-drawing-loading-overlay__mark" aria-hidden="true">
        <span class="ml-drawing-loading-overlay__ring"></span>
        <span class="ml-drawing-loading-overlay__line"></span>
        <span class="ml-drawing-loading-overlay__dot"></span>
      </div>

      <div class="ml-drawing-loading-overlay__copy">
        <div class="ml-drawing-loading-overlay__title">
          {{ t('main.loadingOverlay.title') }}
        </div>
        <div class="ml-drawing-loading-overlay__subtitle">
          {{ t('main.loadingOverlay.subtitle') }}
        </div>
      </div>

      <div class="ml-drawing-loading-overlay__track" aria-hidden="true">
        <div
          class="ml-drawing-loading-overlay__progress"
          :style="{ transform: `scaleX(${progressScale})` }"
        ></div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { eventBus } from '@mlightcad/cad-simple-viewer'
import type { AcDbProgressdEventArgs } from '@mlightcad/data-model'
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()
const percentage = ref(8)

const progressScale = computed(() => {
  const normalized = Math.max(8, Math.min(100, percentage.value))
  return normalized / 100
})

const updateProgress = (progress: AcDbProgressdEventArgs) => {
  percentage.value = progress.percentage
}

onMounted(() => {
  eventBus.on('open-file-progress', updateProgress)
})

onUnmounted(() => {
  eventBus.off('open-file-progress', updateProgress)
})
</script>

<style scoped>
.ml-drawing-loading-overlay {
  position: fixed;
  inset: 0;
  z-index: 20;
  display: flex;
  align-items: center;
  justify-content: center;
  box-sizing: border-box;
  padding: max(24px, env(safe-area-inset-top))
    max(18px, env(safe-area-inset-right))
    max(24px, env(safe-area-inset-bottom))
    max(18px, env(safe-area-inset-left));
  color: var(--el-text-color-primary);
  background: color-mix(in srgb, var(--el-bg-color) 96%, transparent);
  backdrop-filter: blur(10px);
}

.ml-drawing-loading-overlay__content {
  display: flex;
  flex-direction: column;
  align-items: center;
  width: min(320px, 100%);
  gap: 18px;
  text-align: center;
}

.ml-drawing-loading-overlay__mark {
  position: relative;
  width: clamp(72px, 16vw, 108px);
  aspect-ratio: 1;
}

.ml-drawing-loading-overlay__ring {
  position: absolute;
  inset: 0;
  border: 2px solid color-mix(in srgb, var(--el-border-color) 65%, transparent);
  border-top-color: var(--el-color-primary);
  border-radius: 50%;
  animation: ml-loading-spin 1.1s cubic-bezier(0.65, 0, 0.35, 1) infinite;
}

.ml-drawing-loading-overlay__line {
  position: absolute;
  left: 18%;
  right: 18%;
  top: 50%;
  height: 2px;
  background: var(--el-color-primary);
  border-radius: 999px;
  transform-origin: center;
  animation: ml-loading-line 1.8s ease-in-out infinite;
}

.ml-drawing-loading-overlay__dot {
  position: absolute;
  top: calc(50% - 4px);
  left: calc(18% - 4px);
  width: 8px;
  height: 8px;
  background: var(--el-color-primary);
  border-radius: 50%;
  box-shadow: 0 0 0 5px
    color-mix(in srgb, var(--el-color-primary) 16%, transparent);
  animation: ml-loading-dot 1.8s ease-in-out infinite;
}

.ml-drawing-loading-overlay__copy {
  display: grid;
  gap: 6px;
}

.ml-drawing-loading-overlay__title {
  font-size: clamp(16px, 2.8vw, 19px);
  font-weight: 650;
}

.ml-drawing-loading-overlay__subtitle {
  color: var(--el-text-color-secondary);
  font-size: clamp(12px, 2.6vw, 13px);
  line-height: 1.45;
}

.ml-drawing-loading-overlay__track {
  width: min(220px, 78vw);
  height: 4px;
  overflow: hidden;
  background: color-mix(in srgb, var(--el-border-color) 55%, transparent);
  border-radius: 999px;
}

.ml-drawing-loading-overlay__progress {
  width: 100%;
  height: 100%;
  background: var(--el-color-primary);
  border-radius: inherit;
  transform-origin: left center;
  transition: transform 220ms ease;
}

@keyframes ml-loading-spin {
  to {
    transform: rotate(360deg);
  }
}

@keyframes ml-loading-line {
  0%,
  100% {
    transform: rotate(0deg) scaleX(0.72);
  }

  50% {
    transform: rotate(-28deg) scaleX(0.9);
  }
}

@keyframes ml-loading-dot {
  0%,
  100% {
    transform: translateX(0);
  }

  50% {
    transform: translateX(clamp(46px, 10vw, 69px));
  }
}

@media (prefers-reduced-motion: reduce) {
  .ml-drawing-loading-overlay__ring,
  .ml-drawing-loading-overlay__line,
  .ml-drawing-loading-overlay__dot {
    animation-duration: 3s;
  }
}
</style>
