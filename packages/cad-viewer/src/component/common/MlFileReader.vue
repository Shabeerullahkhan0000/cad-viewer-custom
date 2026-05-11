<template>
  <!-- Hidden file input -->
  <input
    type="file"
    ref="fileInput"
    :accept="accept"
    style="display: none"
    @change="handleFileChange"
  />
</template>

<script setup lang="ts">
import { eventBus } from '@mlightcad/cad-simple-viewer'
import { log } from '@mlightcad/data-model'
import { computed, onMounted, onUnmounted, ref } from 'vue'

import { useFileTypes } from '../../composable/useFileTypes'

// Define the types for the events we emit
const emit = defineEmits<{
  (e: 'file-read', fileName: string, fileContent: string | ArrayBuffer): void
}>()

// Type reference for the input element
const fileInput = ref<HTMLInputElement | null>(null)

const supportedFileTypes = useFileTypes()

const accept = computed(() => {
  const fileTypes = Array.from(supportedFileTypes.value)
  let result = ''
  for (let index = 0, size = fileTypes.length; index < size; ++index) {
    if (index == size - 1) {
      result += `.${fileTypes[index]}`
    } else {
      result += `.${fileTypes[index]}, `
    }
  }
  return result
})

const openFileInput = () => {
  fileInput.value?.click()
}

onMounted(() => {
  eventBus.on('open-file', openFileInput)
})

onUnmounted(() => {
  eventBus.off('open-file', openFileInput)
})

const readFileAsArrayBuffer = (file: File) => {
  if (typeof file.arrayBuffer === 'function') {
    return file.arrayBuffer()
  }

  return new Promise<ArrayBuffer>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = (event: ProgressEvent<FileReader>) => {
      const fileContent = event.target?.result
      if (fileContent) {
        resolve(fileContent as ArrayBuffer)
      } else {
        reject(new Error('Failed to read the file.'))
      }
    }
    reader.onerror = () => reject(new Error('Failed to read the file.'))
    reader.readAsArrayBuffer(file)
  })
}

// Handle file input change and emit file content
const handleFileChange = async (event: Event): Promise<void> => {
  const target = event.target as HTMLInputElement
  const selectedFile = target.files?.[0]

  if (selectedFile && selectedFile.name) {
    try {
      const fileContent = await readFileAsArrayBuffer(selectedFile)
      emit('file-read', selectedFile.name, fileContent)
    } catch {
      log.error('Failed to read the file.')
    } finally {
      target.value = ''
    }
  }
}
</script>
