<template>
  <ml-status-bar
    :class="{ 'is-disabled': isStatusBarDisabled }"
    :aria-disabled="isStatusBarDisabled"
    class="ml-status-bar"
  >
    <!-- Right Slot Content -->
    <template #right>
      <ml-progress />
      <el-button-group class="ml-status-bar-right-button-group">
        <ml-warning-button />
        <ml-notification-button @click="toggleNotificationCenter" />
        <ml-theme-button
          :is-dark="props.isDark"
          :toggle-dark="props.toggleDark"
        />
        <ml-full-screen-button />
        <ml-osnap-button />
        <ml-sys-var-toggle-button
          :sys-var-name="AcDbSystemVariables.LWDISPLAY"
          :on-icon="lineWidth"
          :off-icon="lineWidth"
          :on-tooltip="t('main.statusBar.lineWidth.on')"
          :off-tooltip="t('main.statusBar.lineWidth.off')"
          on-color="var(--el-color-primary)"
          off-color="var(--el-text-color-regular)"
        />
        <ml-sys-var-toggle-button
          :sys-var-name="AcDbSystemVariables.DYNMODE"
          :on-icon="dynamicInput"
          :off-icon="dynamicInput"
          :on-tooltip="t('main.statusBar.dynamicInput.on')"
          :off-tooltip="t('main.statusBar.dynamicInput.off')"
          on-color="var(--el-color-primary)"
          off-color="var(--el-text-color-regular)"
          remember-last-enabled
        />
        <ml-setting-button />
      </el-button-group>
    </template>
  </ml-status-bar>
</template>

<script setup lang="ts">
import { AcDbSystemVariables } from '@mlightcad/data-model'
import { MlStatusBar } from '@mlightcad/ui-components'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

import { useDocumentOpening } from '../../composable'
import { dynamicInput, lineWidth } from '../../svg'
import { MlSysVarToggleButton } from '../common'
import MlFullScreenButton from './MlFullScreenButton.vue'
import MlNotificationButton from './MlNotificationButton.vue'
import MlOsnapButton from './MlOsnapButton.vue'
import MlProgress from './MlProgress.vue'
import MlSettingButton from './MlSettingButton.vue'
import MlThemeButton from './MlThemeButton.vue'
import MlWarningButton from './MlWarningButton.vue'

const props = defineProps<{
  isDark: boolean
  toggleDark: () => void
}>()

const { isDocumentOpening } = useDocumentOpening()
const { t } = useI18n()
const isStatusBarDisabled = computed(() => isDocumentOpening.value)

const emit = defineEmits<{
  toggleNotificationCenter: []
}>()

const toggleNotificationCenter = () => {
  if (isStatusBarDisabled.value) return
  emit('toggleNotificationCenter')
}
</script>

<style scoped>
.ml-status-bar {
  box-sizing: border-box;
}

.ml-status-bar.is-disabled {
  opacity: 0.6;
  pointer-events: none;
  user-select: none;
}

.ml-status-bar-right-button-group {
  border: none;
  padding: 0px;
  height: var(--ml-status-bar-height);
}

</style>
