import peerDepsExternal from 'rollup-plugin-peer-deps-external'
import { defineConfig, PluginOption } from 'vite'
import { viteStaticCopy } from 'vite-plugin-static-copy'

const patchLibreDwgParserWorker = (content: string) => {
  const helper = `function __cadPreallocateLibreDwgHeap(g,A){try{if(!A||A<=0)return;const B=Math.max(0,Math.ceil(A/65536)+256)*65536,Q=g&&g.wasmInstance?g.wasmInstance:g,E=Q&&Q.HEAPU8?Q.HEAPU8.byteLength:0;if(!E||B<=E)return;const w=Q&&("function"==typeof Q._emscripten_resize_heap?Q._emscripten_resize_heap:"function"==typeof Q.emscripten_resize_heap?Q.emscripten_resize_heap:void 0);if(w){w.call(Q,B);return}const C=Q&&(Q.wasmMemory||Q.memory);C&&"function"==typeof C.grow&&C.grow(Math.ceil((B-E)/65536))}catch{}}`
  if (content.includes('__cadPreallocateLibreDwgHeap')) return content

  return content
    .replace(
      'async function EG(g) {',
      `${helper}\nasync function EG(g) {\n  const __cadInput = g && typeof g === "object" && "data" in g ? g : { data: g, fileByteLength: g && g.byteLength || 0 };\n  const __cadFileBytes = __cadInput.fileByteLength || (__cadInput.data && __cadInput.data.byteLength) || 0;\n  g = __cadInput.data;`
    )
    .replace(
      'const B = A.dwg_read_data(g, yC.DWG);',
      '__cadPreallocateLibreDwgHeap(A, __cadFileBytes);\n  const B = A.dwg_read_data(g, yC.DWG);'
    )
}

export default defineConfig({
  build: {
    outDir: 'dist',
    lib: {
      entry: 'src/index.ts',
      name: 'cad-simple-viewer',
      fileName: 'index'
    },
    minify: true
  },
  plugins: [
    peerDepsExternal() as PluginOption,
    viteStaticCopy({
      targets: [
        {
          src: './node_modules/@mlightcad/libredwg-converter/dist/libredwg-parser-worker.js',
          dest: '',
          transform: patchLibreDwgParserWorker
        },
        {
          src: './node_modules/@mlightcad/mtext-renderer/dist/mtext-renderer-worker.js',
          dest: ''
        }
      ]
    })
  ]
})
