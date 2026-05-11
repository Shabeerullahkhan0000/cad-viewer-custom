<template>
  <div class="ml-compact-header" aria-label="Drawing controls">
    <button
      :aria-label="backLabel"
      :disabled="isDocumentOpening"
      :title="backLabel"
      class="ml-compact-header__icon-button"
      type="button"
      @click="handleBack"
    >
      <Back class="ml-compact-header__icon" />
    </button>

    <div class="ml-compact-header__title-wrap">
      <div class="ml-compact-header__title" :title="drawingName">
        {{ drawingName }}
      </div>
    </div>

    <div class="ml-compact-header__actions" aria-label="File actions">
      <button
        :aria-label="t('main.mainMenu.open')"
        :disabled="isDocumentOpening"
        :title="t('main.mainMenu.open')"
        class="ml-compact-header__button"
        type="button"
        @click="openDrawing"
      >
        <FolderOpened class="ml-compact-header__icon" />
        <span>{{ t('main.mainMenu.open') }}</span>
      </button>

      <button
        :aria-label="t('main.mainMenu.export')"
        :disabled="isDocumentOpening"
        :title="t('main.mainMenu.export')"
        class="ml-compact-header__button ml-compact-header__button--share"
        type="button"
        @click="exportToDxf"
      >
        <Share class="ml-compact-header__icon" />
        <span>{{ t('main.compactHeader.share') }}</span>
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { Back, FolderOpened, Share } from '@element-plus/icons-vue'
import {
  AcApConvertToDxfCmd,
  AcApDocManager,
  eventBus
} from '@mlightcad/cad-simple-viewer'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

import { store } from '../../app/store'
import { useDocumentOpening } from '../../composable/useDocumentOpening'

const emit = defineEmits<{
  (e: 'back'): void
}>()

const { t } = useI18n()
const { isDocumentOpening } = useDocumentOpening()
const backLabel = 'Back to recent drawings'
const drawingName = computed(() => store.fileName || 'Drawing')

const handleBack = () => {
  if (isDocumentOpening.value) return
  emit('back')
}

const openDrawing = () => {
  if (isDocumentOpening.value) return
  eventBus.emit('open-file', {})
}

const exportToDxf = () => {
  if (isDocumentOpening.value) return
  const command = new AcApConvertToDxfCmd()
  command.trigger(AcApDocManager.instance.context)
}
</script>

<style scoped>
.ml-compact-header {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  align-items: center;
  gap: 10px;
  box-sizing: border-box;
  width: 100%;
  min-height: 52px;
  padding: calc(env(safe-area-inset-top, 0px) + 8px)
    max(14px, env(safe-area-inset-right, 0px)) 8px
    max(14px, env(safe-area-inset-left, 0px));
  color: var(--el-text-color-primary);
  background:
    linear-gradient(
      180deg,
      color-mix(in srgb, var(--el-bg-color) 98%, transparent),
      color-mix(in srgb, var(--el-bg-color) 88%, transparent)
    );
  border-bottom: 1px solid
    color-mix(in srgb, var(--el-border-color-lighter) 84%, transparent);
  box-shadow:
    0 1px 0 color-mix(in srgb, #fff 38%, transparent) inset,
    0 10px 30px rgba(15, 23, 42, 0.12);
  backdrop-filter: blur(16px);
}

.ml-compact-header__button,
.ml-compact-header__icon-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  box-sizing: border-box;
  height: 38px;
  color: var(--el-text-color-primary);
  background: color-mix(in srgb, var(--el-fill-color-blank) 92%, transparent);
  border: 1px solid color-mix(in srgb, var(--el-border-color) 88%, transparent);
  border-radius: 8px;
  cursor: pointer;
  font: inherit;
  font-size: 13px;
  font-weight: 650;
  line-height: 1;
  white-space: nowrap;
  -webkit-tap-highlight-color: transparent;
  touch-action: manipulation;
  transition:
    color 120ms ease,
    border-color 120ms ease,
    background 120ms ease,
    box-shadow 120ms ease,
    transform 120ms ease;
}

.ml-compact-header__button {
  min-width: 106px;
  padding: 0 12px;
}

.ml-compact-header__icon-button {
  width: 38px;
  padding: 0;
}

.ml-compact-header__button:hover,
.ml-compact-header__icon-button:hover,
.ml-compact-header__button:focus-visible,
.ml-compact-header__icon-button:focus-visible {
  color: var(--el-color-primary);
  border-color: var(--el-color-primary-light-5);
  background: var(--el-color-primary-light-9);
  box-shadow: 0 6px 16px rgba(15, 23, 42, 0.1);
  transform: translateY(-1px);
}

.ml-compact-header__button:disabled,
.ml-compact-header__icon-button:disabled {
  cursor: default;
  opacity: 0.55;
}

.ml-compact-header__button--share {
  min-width: 88px;
}

.ml-compact-header__actions {
  display: inline-flex;
  align-items: center;
  justify-content: flex-end;
  min-width: 0;
  gap: 8px;
}

.ml-compact-header__icon {
  width: 16px;
  height: 16px;
  flex: 0 0 auto;
}

.ml-compact-header__title-wrap {
  display: flex;
  align-items: center;
  justify-content: center;
  min-width: 0;
}

.ml-compact-header__title {
  min-width: 0;
  max-width: min(52vw, 520px);
  overflow: hidden;
  font-size: 14px;
  font-weight: 700;
  line-height: 1.2;
  text-align: center;
  text-overflow: ellipsis;
  white-space: nowrap;
}

@media (max-width: 720px), (pointer: coarse) {
  .ml-compact-header {
    grid-template-columns: auto minmax(0, 1fr) auto;
    gap: 10px;
    min-height: calc(env(safe-area-inset-top, 0px) + 58px);
    padding: calc(env(safe-area-inset-top, 0px) + 7px)
      max(10px, env(safe-area-inset-right, 0px)) 7px
      max(10px, env(safe-area-inset-left, 0px));
  }

  .ml-compact-header__actions {
    gap: 6px;
  }

  .ml-compact-header__icon-button,
  .ml-compact-header__button {
    height: 44px;
    border-radius: 8px;
  }

  .ml-compact-header__icon-button {
    width: 44px;
  }

  .ml-compact-header__button {
    min-width: 0;
    width: 44px;
    padding: 0;
  }

  .ml-compact-header__button span {
    display: none;
  }

  .ml-compact-header__icon {
    width: 18px;
    height: 18px;
  }

  .ml-compact-header__title {
    max-width: none;
    font-size: 13px;
  }
}

@media (max-width: 360px) {
  .ml-compact-header {
    gap: 8px;
    padding-right: max(8px, env(safe-area-inset-right, 0px));
    padding-left: max(8px, env(safe-area-inset-left, 0px));
  }

  .ml-compact-header__actions {
    gap: 5px;
  }

  .ml-compact-header__icon-button,
  .ml-compact-header__button {
    width: 44px;
    height: 44px;
  }

  .ml-compact-header__title {
    font-size: 12px;
  }
}

@media (prefers-reduced-motion: reduce) {
  .ml-compact-header__button,
  .ml-compact-header__icon-button {
    transition: none;
  }

  .ml-compact-header__button:hover,
  .ml-compact-header__icon-button:hover,
  .ml-compact-header__button:focus-visible,
  .ml-compact-header__icon-button:focus-visible {
    transform: none;
  }
}
</style>
