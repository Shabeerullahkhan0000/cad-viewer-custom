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

    <button
      :disabled="isDocumentOpening"
      class="ml-compact-header__button"
      type="button"
      @click="openDrawing"
    >
      <FolderOpened class="ml-compact-header__icon" />
      <span>{{ t('main.mainMenu.open') }}</span>
    </button>

    <div class="ml-compact-header__title" :title="drawingName">
      {{ drawingName }}
    </div>

    <button
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
  grid-template-columns: auto auto minmax(0, 1fr) auto;
  align-items: center;
  gap: 10px;
  box-sizing: border-box;
  width: 100%;
  min-height: 52px;
  padding: 8px 14px;
  color: var(--el-text-color-primary);
  background: color-mix(in srgb, var(--el-bg-color) 94%, transparent);
  border-bottom: 1px solid var(--el-border-color-lighter);
  box-shadow: 0 1px 8px rgba(15, 23, 42, 0.08);
  backdrop-filter: blur(10px);
}

.ml-compact-header__button,
.ml-compact-header__icon-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  box-sizing: border-box;
  height: 36px;
  color: var(--el-text-color-primary);
  background: var(--el-fill-color-blank);
  border: 1px solid var(--el-border-color);
  border-radius: 6px;
  cursor: pointer;
  font: inherit;
  line-height: 1;
  white-space: nowrap;
}

.ml-compact-header__button {
  min-width: 118px;
  padding: 0 14px;
}

.ml-compact-header__icon-button {
  width: 36px;
  padding: 0;
}

.ml-compact-header__button:hover,
.ml-compact-header__icon-button:hover {
  color: var(--el-color-primary);
  border-color: var(--el-color-primary-light-5);
}

.ml-compact-header__button:disabled,
.ml-compact-header__icon-button:disabled {
  cursor: default;
  opacity: 0.55;
}

.ml-compact-header__button--share {
  min-width: 92px;
}

.ml-compact-header__icon {
  width: 16px;
  height: 16px;
  flex: 0 0 auto;
}

.ml-compact-header__title {
  min-width: 0;
  overflow: hidden;
  font-size: 14px;
  font-weight: 600;
  text-align: center;
  text-overflow: ellipsis;
  white-space: nowrap;
}

@media (max-width: 560px) {
  .ml-compact-header {
    grid-template-columns: auto minmax(0, 1fr) auto;
    gap: 8px;
  }

  .ml-compact-header__button {
    min-width: 0;
    width: 36px;
    padding: 0;
  }

  .ml-compact-header__button span {
    display: none;
  }
}
</style>
