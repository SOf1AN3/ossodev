// E2E de la boucle Companion : présence → enfilage → claim → exécution → clôture.
// node --env-file=.env scripts/qa-companion-e2e.mjs
import postgres from 'postgres'

const BASE = process.env.OSSO_BASE ?? 'http://localhost:3000'
let ko = 0, n = 0
const ok = (c, l, e = '') => { n++; if (!c) ko++; console.log(`${c ? 'OK  ' : 'KO  '}${l}${e ? ` — ${e}` : ''}`) }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const sql = postgres(process.env.DATABASE_URL, { max: 1, ssl: 'require' })
const status = async () => {
  const r = await fetch(`${BASE}/api/companion/status`).then((x) => x.json()).catch(() => null)
  return r?.data ?? null
}

// ── 1. Le Companion doit passer EN LIGNE (heartbeat) ─────────────────────────
console.log('=== 1. PRÉSENCE ===')
let online = null
for (let i = 0; i < 40; i++) {
  const s = await status()
  if (s?.available) { online = s; break }
  await sleep(2000)
}
ok(!!online, 'le Companion passe en ligne (heartbeat)', online ? `vu ${online.lastSeenAt}` : 'jamais vu après 80 s')
if (!online) {
  await sql.end({ timeout: 1 })
  console.log('\nKO — Companion non détecté, arrêt.')
  process.exit(1)
}
ok(online.reason === null, 'reason null quand en ligne', String(online.reason))

// ── 2. Enfile une vraie commande ─────────────────────────────────────────────
console.log('\n=== 2. ENFILAGE ===')
const enq = await fetch(`${BASE}/api/brain/scan`, { method: 'POST' }).then((x) => x.json())
ok(!!enq?.data?.command_id, 'POST /api/brain/scan', String(enq?.data?.command_id))
const id = enq?.data?.command_id
if (!id) { await sql.end({ timeout: 1 }); process.exit(1) }

const att = await sql`select status, command_key, expires_at > now() as non_expiree from companion_commands where id = ${id}`
ok(att[0]?.status === 'pending', 'état initial = pending')
ok(att[0]?.command_key === 'brain:scan', 'command_key = brain:scan')
ok(att[0]?.non_expiree === true, 'non expirée')

// ── 3. Le Companion doit la réclamer puis l'exécuter ─────────────────────────
console.log('\n=== 3. EXÉCUTION PAR LE COMPANION ===')
let fini = null
const t0 = Date.now()
for (let i = 0; i < 35; i++) {
  const r = await sql`select status, result_text, claimed_at, executed_at from companion_commands where id = ${id}`
  if (r[0]?.status === 'done' || r[0]?.status === 'failed') { fini = r[0]; break }
  await sleep(1500)
}
const dt = Math.round((Date.now() - t0) / 1000)
ok(!!fini, 'la commande a été exécutée', fini ? `état=${fini.status} après ${dt} s` : `toujours en cours après ${dt} s`)
ok(fini?.status === 'done', 'état final = done', String(fini?.status))
ok(!!fini?.claimed_at, 'claimed_at renseigné (réclamation effective)')
ok(!!fini?.executed_at, 'executed_at renseigné (exécution effective)')
console.log(`  result_text : ${fini?.result_text ?? '(vide)'}`)

// ── 4. La signature a bien été vérifiée (sinon : fail-closed, rien ne passe) ─
console.log('\n=== 4. SIGNATURE ===')
const row = await sql`select signature, payload, created_at, expires_at from companion_commands where id = ${id}`
const { createHmac } = await import('node:crypto')
const base = `${id}|${row[0].command_key ?? 'brain:scan'}|${JSON.stringify(row[0].payload)}|${new Date(row[0].expires_at).toISOString()}`
const want = createHmac('sha256', process.env.COMPANION_SECRET).update(base).digest('hex')
ok(want === row[0].signature, 'HMAC recalculé = signature stockée (le Companion a pu vérifier)')

// ── 5. Le scan doit avoir alimenté la table projets ──────────────────────────
console.log('\n=== 5. RÉSULTAT DU SCAN ===')
const projets = await sql`select count(*)::int as n from projects`
ok(projets[0].n >= 1, 'des projets sont en base après scan', `${projets[0].n} (dossier dev réel)`)

// ── 6. État du Companion pour la pastille ───────────────────────────────────
console.log('\n=== 6. PASTILLE ===')
const s2 = await status()
ok(s2?.available === true, 'toujours en ligne', `reason=${s2?.reason}`)

await sql.end({ timeout: 1 })
console.log(`\n=== ${ko === 0 ? `BOUCLE COMPANION : ${n}/${n} VERTS` : `${ko} ÉCHEC(S) sur ${n}`} ===`)
process.exit(ko === 0 ? 0 : 1)
