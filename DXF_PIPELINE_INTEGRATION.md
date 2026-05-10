# Shabeer CAD DXF Pipeline Integration

This pipeline moves DXF interpretation out of the browser and into a controlled server-side normalization step:

1. Upload DXF to your server or storage bucket.
2. Run `dxf_parser.py` with Python + `ezdxf`.
3. Store the generated `drawing.json`.
4. Fetch `drawing.json` in the browser.
5. Render using `dxf_renderer.ts`.

## Install

```bash
pip install ezdxf
```

## Parse a DXF

```bash
python dxf_parser.py uploads/input.dxf -o public/drawing.json
```

The parser prints:

- total parsed entities
- total skipped entities
- parse errors
- entity type breakdown
- overall drawing bounds

Skipped entities are preserved in the JSON under `skipped`, including handle, layer, source, and reason.

## Next.js 14 API Route

Use this when your Next.js server can run Python locally. Keep this route server-only and never run it from a Client Component.

```ts
// app/api/dxf/parse/route.ts
import { randomUUID } from 'node:crypto'
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { spawn } from 'node:child_process'
import { NextRequest, NextResponse } from 'next/server'

export const runtime = 'nodejs'

function runParser(inputPath: string, outputPath: string) {
  return new Promise<void>((resolve, reject) => {
    const child = spawn('python', ['dxf_parser.py', inputPath, '-o', outputPath], {
      cwd: process.cwd(),
      stdio: ['ignore', 'pipe', 'pipe'],
    })

    let stderr = ''
    child.stderr.on('data', chunk => {
      stderr += chunk.toString()
    })
    child.on('error', reject)
    child.on('close', code => {
      if (code === 0) resolve()
      else reject(new Error(stderr || `dxf_parser.py exited with code ${code}`))
    })
  })
}

export async function POST(request: NextRequest) {
  const formData = await request.formData()
  const file = formData.get('file')
  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'DXF file is required' }, { status: 400 })
  }

  const jobId = randomUUID()
  const jobDir = join(process.cwd(), '.uploads', jobId)
  await mkdir(jobDir, { recursive: true })

  const inputPath = join(jobDir, file.name.toLowerCase().endsWith('.dxf') ? file.name : 'input.dxf')
  const outputPath = join(jobDir, 'drawing.json')
  await writeFile(inputPath, Buffer.from(await file.arrayBuffer()))
  await runParser(inputPath, outputPath)

  return NextResponse.json({ jobId, drawingUrl: `/api/dxf/drawing/${jobId}` })
}
```

Serve the generated JSON:

```ts
// app/api/dxf/drawing/[jobId]/route.ts
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { NextRequest, NextResponse } from 'next/server'

export const runtime = 'nodejs'

export async function GET(_request: NextRequest, context: { params: { jobId: string } }) {
  const jsonPath = join(process.cwd(), '.uploads', context.params.jobId, 'drawing.json')
  const data = await readFile(jsonPath, 'utf8')
  return new NextResponse(data, {
    headers: { 'content-type': 'application/json; charset=utf-8' },
  })
}
```

Render in a Client Component:

```tsx
'use client'

import { useEffect, useRef } from 'react'
import { renderDxfDrawing } from '@/lib/dxf_renderer'

export function CadCanvas({ drawingUrl }: { drawingUrl: string }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    let cancelled = false
    renderDxfDrawing(canvas, drawingUrl, {
      backgroundColor: '#050505',
      renderHatchFills: false,
      onEntityRendered(record) {
        if (!cancelled) {
          console.debug('rendered handle', record.handle)
        }
      },
    }).catch(error => {
      console.error(error)
    })

    return () => {
      cancelled = true
    }
  }, [drawingUrl])

  return <canvas ref={canvasRef} className="h-full w-full" />
}
```

## FastAPI Microservice

Use this when Python should run outside the Next.js process.

```py
# api.py
from pathlib import Path
from tempfile import TemporaryDirectory

from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.responses import JSONResponse

from dxf_parser import DxfJsonParser

app = FastAPI(title="Shabeer CAD DXF Parser")


@app.post("/parse-dxf")
async def parse_dxf(file: UploadFile = File(...)):
    if not file.filename or not file.filename.lower().endswith(".dxf"):
        raise HTTPException(status_code=400, detail="Only DXF files are supported")

    with TemporaryDirectory() as temp_dir:
        temp_path = Path(temp_dir)
        input_path = temp_path / file.filename
        output_path = temp_path / "drawing.json"
        input_path.write_bytes(await file.read())

        parser = DxfJsonParser()
        drawing = parser.parse_file(input_path, output_path)
        return JSONResponse(drawing)
```

Run it:

```bash
pip install fastapi uvicorn python-multipart ezdxf
uvicorn api:app --host 0.0.0.0 --port 8000
```

Call it from Next.js:

```ts
export async function parseViaFastApi(file: File) {
  const formData = new FormData()
  formData.append('file', file)
  const response = await fetch('http://localhost:8000/parse-dxf', {
    method: 'POST',
    body: formData,
  })
  if (!response.ok) {
    throw new Error(await response.text())
  }
  return response.json()
}
```

## Special Handling Flags

- `WIPEOUT`, `OLE2FRAME`, `OLEFRAME`, `ACAD_PROXY_ENTITY`, and `VIEWPORT` are skipped and logged. They are not rendered as white blocks.
- `LWPOLYLINE` and `POLYLINE` preserve raw `bulge` values and also include sampled `points`, so the browser can render arcs without implementing bulge math first.
- `INSERT` expands block references with `virtual_entities()`. Child handles are synthetic when ezdxf does not expose a real nested handle.
- `HATCH` boundary paths are serialized as polyline paths or edge paths. The Canvas renderer strokes boundaries by default; set `renderHatchFills: true` only after you trust the file source.
- `DIMENSION` is expanded through virtual entities when ezdxf can generate them. The original definition points remain available for measurement and editing tools.
- `SPLINE`, `ARC`, and `ELLIPSE` include sampled points for fast Canvas rendering and bounds calculation.
- Canvas is immediate mode. The renderer returns `objects[]`, where each record uses the DXF `handle` as `id`; use those records with `ctx.isPointInStroke()` / `ctx.isPointInPath()` for hit-testing.
