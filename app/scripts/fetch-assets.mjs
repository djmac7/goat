// Download the team logos + player headshots ONCE and self-host them under public/img,
// so the app never depends on third-party CDNs at runtime. Re-runnable (skips files that
// already exist). Anything that 404s is simply left out — the app falls back to initials.
//
//   node scripts/fetch-assets.mjs
//
// Sources: ESPN team-logo CDN (by franchise) and Basketball-Reference headshots (by slug).
// These are trademarked logos / licensed photos used here for a non-commercial fan project;
// swap in properly licensed assets before any commercial use.
import { readFileSync, mkdirSync, writeFileSync, existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const pub = join(here, '..', 'public')
const data = JSON.parse(readFileSync(join(pub, 'data', 'goat-data.json'), 'utf8'))

// franchise -> ESPN logo code (mirror of src/ui/assets.js)
const ESPN_CODE = {
  CHI: 'chi', GSW: 'gs', LAL: 'lal', SAS: 'sa', BOS: 'bos', MIA: 'mia', HOU: 'hou',
  DAL: 'dal', TOR: 'tor', DET: 'det', PHO: 'phx', MIL: 'mil', DEN: 'den', PHI: 'phi',
  NYK: 'ny', UTA: 'utah',
}

mkdirSync(join(pub, 'img', 'teams'), { recursive: true })
mkdirSync(join(pub, 'img', 'players'), { recursive: true })

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36'

const tasks = []
// team logos
for (const fr of data.pool.franchises) {
  const code = ESPN_CODE[fr.id]
  if (!code) continue
  tasks.push({ url: `https://a.espncdn.com/i/teamlogos/nba/500/${code}.png`, dest: join(pub, 'img', 'teams', `${fr.id}.png`) })
}
// player headshots (unique slugs)
const slugs = [...new Set(data.players.map((p) => p.player_id))]
for (const slug of slugs) {
  tasks.push({ url: `https://www.basketball-reference.com/req/202106291/images/headshots/${slug}.jpg`, dest: join(pub, 'img', 'players', `${slug}.jpg`) })
}

let ok = 0, miss = 0, skip = 0
async function run(task) {
  if (existsSync(task.dest)) { skip++; return }
  try {
    const res = await fetch(task.url, { headers: { 'User-Agent': UA } })
    if (!res.ok) { miss++; return }
    const buf = Buffer.from(await res.arrayBuffer())
    if (buf.length < 200) { miss++; return } // tiny/placeholder = treat as missing
    writeFileSync(task.dest, buf)
    ok++
  } catch {
    miss++
  }
}

// modest concurrency to be polite to the source servers
const CONCURRENCY = 8
console.log(`[fetch-assets] ${tasks.length} files (16 logos + ${slugs.length} headshots)…`)
let i = 0
async function worker() {
  while (i < tasks.length) {
    const t = tasks[i++]
    await run(t)
    if ((ok + miss + skip) % 100 === 0) process.stdout.write(`\r  ${ok} saved · ${miss} missing · ${skip} skipped`)
  }
}
await Promise.all(Array.from({ length: CONCURRENCY }, worker))
console.log(`\r[fetch-assets] done: ${ok} saved · ${miss} missing (fall back to initials) · ${skip} already present`)
