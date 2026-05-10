import { cp, rm } from 'node:fs/promises'
import { resolve } from 'node:path'

const rootDir = resolve(import.meta.dirname, '..')
const sourceDir = resolve(rootDir, 'packages/cad-viewer-example/dist')
const outputDir = resolve(rootDir, 'dist')

await rm(outputDir, { recursive: true, force: true })
await cp(sourceDir, outputDir, { recursive: true })
