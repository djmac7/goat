// Copy the finished data files from the data workstream (../data) into the app's
// public/ dir so Vite serves them at /data/*.json. Keeps a single source of truth:
// the app never forks the dataset, it just mirrors the shipped artifacts.
import { copyFileSync, mkdirSync, existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const repo = join(here, '..', '..')
const srcDir = join(repo, 'data')
const destDir = join(here, '..', 'public', 'data')

mkdirSync(destDir, { recursive: true })

const files = ['goat-data.json', 'percentile-table.json']
let missing = false
for (const f of files) {
  const src = join(srcDir, f)
  if (!existsSync(src)) {
    console.warn(`[sync-data] WARN missing ${src} — run the pipeline (python pipeline/run.py)`)
    missing = true
    continue
  }
  copyFileSync(src, join(destDir, f))
  console.log(`[sync-data] ${f} -> public/data/${f}`)
}
if (missing) console.warn('[sync-data] real data incomplete; the app can still run on placeholder data (VITE_DATA_SOURCE=placeholder).')
