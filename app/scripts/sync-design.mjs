// Pull the shared Hardwood design tokens into the app so styles.css can @import them.
// Single source of truth is the sibling `hardwood-ds` project; here we just mirror it
// (same pattern as sync-data). Tolerant by design: if hardwood-ds isn't checked out,
// keep the committed mirror so the app still builds.
//
// Byte-identical to what `hardwood-ds/sync.mjs` writes (same banner), so it doesn't
// matter which side ran last — no spurious git churn.
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const repo = join(here, '..', '..')            // /Users/d/six-spins
const srcDir = join(repo, '..', 'hardwood-ds') // /Users/d/hardwood-ds
const destDir = join(here, '..', 'src', 'design')

const files = ['tokens.css', 'fonts.css']
const banner = (f) =>
  `/* AUTO-GENERATED — do not edit. Source of truth: hardwood-ds/${f}\n` +
  `   Change tokens in hardwood-ds/${f}, then run \`node sync.mjs\`. */\n`

if (!existsSync(srcDir)) {
  console.warn(`[sync-design] hardwood-ds not found at ${srcDir} — keeping committed mirror in src/design/`)
  process.exit(0)
}

mkdirSync(destDir, { recursive: true })
for (const f of files) {
  const src = join(srcDir, f)
  if (!existsSync(src)) {
    console.warn(`[sync-design] WARN missing ${src}`)
    continue
  }
  writeFileSync(join(destDir, f), banner(f) + readFileSync(src, 'utf8'))
  console.log(`[sync-design] ${f} -> src/design/${f}`)
}
