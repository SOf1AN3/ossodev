// Campagne API — S2 auth · S3 atomicité/idempotence · S4 expiration · S5 chemins.
// Exécutée par le LEAD : le sous-agent Tester n'avait ni Playwright ni client POST.
// node --env-file=.env scripts/qa-api.mjs
const BASE = process.env.OSSO_BASE ?? 'http://localhost:3000'
const SECRET = process.env.COMPANION_SECRET
if (!SECRET) { console.error('✗ COMPANION_SECRET absent — relance scripts/companion-init.mjs'); process.exit(1) }

let ko = 0, n = 0
const ok = (cond, label, extra = '') => {
  n++
  if (!cond) ko++
  console.log(`${cond ? 'OK  ' : 'KO  '}${label}${extra ? ` — ${extra}` : ''}`)
}
async function call(method, path, body, headers = {}) {
  const r = await fetch(`${BASE}${path}`, {
    method,
    headers: { ...(body ? { 'content-type': 'application/json' } : {}), ...headers },
    body: body ? JSON.stringify(body) : undefined,
  })
  let json = null
  try { json = await r.json() } catch { /* non-JSON */ }
  return { status: r.status, json }
}
const auth = { Authorization: `Bearer ${SECRET}` }

// ═══ S2 — Authentification ══════════════════════════════════════════════════
console.log('=== S2 — AUTHENTIFICATION ===')
const enq = await call('POST', '/api/brain/scan')
ok(enq.status === 200, 'POST /api/brain/scan enfile', `HTTP ${enq.status}`)
const id = enq.json?.data?.command_id
ok(!!id, 'command_id renvoyé', String(id))
ok(!('signature' in (enq.json?.data ?? {})), 'l\'enfilage ne retourne pas de signature', `clés : ${Object.keys(enq.json?.data ?? {}).join(',')}`)

ok((await call('POST', '/api/companion/commands/claim')).status === 403, 'claim SANS Authorization → 403')
ok((await call('POST', '/api/companion/commands/claim', undefined, { Authorization: 'Bearer clé-faussée' })).status === 403, 'claim Bearer falsifié → 403')

const avec = await call('POST', '/api/companion/commands/claim', undefined, auth)
ok(avec.status === 200, 'claim BON Bearer → 200', `HTTP ${avec.status}`)
const cmd = (avec.json?.data?.commands ?? []).find((c) => c.id === id)
ok(!!cmd, 'la commande enfilée est retournée')

if (cmd) {
  console.log('\n  — contrat Companion (api.ts exige ces champs) —')
  ok(typeof cmd.signature === 'string' && cmd.signature.length > 0, 'champ `signature` présent')
  ok(typeof cmd.expires_at === 'string', 'champ `expires_at` présent')
  ok(typeof cmd.created_at === 'string', 'champ `created_at` présent')
  ok(!('status' in cmd), 'pas de champ `status` en plus')
  const base = `${cmd.id}|${cmd.command_key}|${JSON.stringify(cmd.payload)}|${cmd.expires_at}`
  const { createHmac, timingSafeEqual } = await import('node:crypto')
  const expected = createHmac('sha256', SECRET).update(base).digest('hex')
  const a = Buffer.from(expected, 'utf8'), b = Buffer.from(cmd.signature, 'utf8')
  ok(a.length === b.length && timingSafeEqual(a, b), 'HMAC recalculé = signature reçue')
}

// ═══ S3 — Atomicité & idempotence ═══════════════════════════════════════════
console.log('\n=== S3 — ATOMICITÉ & IDEMPOTENCE ===')
if (cmd) {
  const deux = await call('POST', '/api/companion/commands/claim', undefined, auth)
  ok(!(deux.json?.data?.commands ?? []).some((c) => c.id === cmd.id), '2ᵉ claim : la commande n\'est plus retournée (claimed)')
  const done = await call('POST', `/api/companion/commands/${cmd.id}/complete`, { status: 'done', result_text: 'test' }, auth)
  ok(done.status === 200, 'complete → 200', `HTTP ${done.status}`)
  ok((await call('POST', `/api/companion/commands/${cmd.id}/complete`, { status: 'failed' }, auth)).status === 409, '2ᵉ complete → 409 (idempotence)')
  const trois = await call('POST', '/api/companion/commands/claim', undefined, auth)
  ok(!(trois.json?.data?.commands ?? []).some((c) => c.id === cmd.id), 'commande clôturée jamais réclamée')
  ok((await call('POST', '/api/companion/commands/00000000-0000-0000-0000-000000000000/complete', { status: 'done' }, auth)).status === 404, 'complete d\'une commande inconnue → 404')
}

// ═══ S4 — Expiration ════════════════════════════════════════════════════════
console.log('\n=== S4 — EXPIRATION ===')
const { default: postgres } = await import('postgres')
const sql = postgres(process.env.DATABASE_URL, { max: 1, ssl: 'require' })
const EXPIRED_ID = '11111111-1111-1111-1111-111111111111'
await sql`
  insert into companion_commands (id, command_key, payload, signature, status, expires_at, created_at)
  values (${EXPIRED_ID}, 'brain:scan', '{}'::jsonb, ${'0'.repeat(64)}, 'pending',
          now() - interval '10 minutes', now() - interval '10 minutes')
  on conflict (id) do nothing`
const exp = await call('POST', '/api/companion/commands/claim', undefined, auth)
ok(!(exp.json?.data?.commands ?? []).some((c) => c.id === EXPIRED_ID), 'commande EXPIRÉE jamais retournée par claim')
await sql`delete from companion_commands where id = ${EXPIRED_ID}`

// ═══ S5 — Validation des chemins ════════════════════════════════════════════
console.log('\n=== S5 — VALIDATION DES CHEMINS (sécurité) ===')
const cas = [
  ['C:/Users/Sofiane/Desktop/dev/a&calc.exe', 'métacaractère &'],
  ['C:/dev/$(whoami)', 'injection de commande'],
  ['C:/dev/x" & del /q *', 'fermeture de guillemet + chaîne'],
  ['..\\..\\Windows', 'traversée de répertoire'],
  ['mon/projet', 'chemin relatif'],
]
let i = 0
for (const [path, quoi] of cas) {
  i++
  const r = await call('POST', '/api/projects', { name: `qa-path-${Date.now()}-${i}`, folder_path: path })
  ok(r.status === 400, `refus — ${quoi}`, `HTTP ${r.status}${r.status !== 400 ? ` : ${r.json?.error?.message}` : ''}`)
}
const legit = await call('POST', '/api/projects', { name: `qa-legit-${Date.now()}`, folder_path: `C:/Users/Sofiane/Desktop/dev/qa-legit-${Date.now()}` })
ok(legit.status === 200, 'chemin légitime accepté', `HTTP ${legit.status}`)

const fuite = await sql`select count(*)::int as n from projects where name like ${'qa-path-%'}`
ok(fuite[0].n === 0, 'aucun projet malveillant n\'a été créé')
const purge = await sql`delete from projects where name like ${'qa-%'} returning name`
console.log(`  projet(s) de test purgé(s) : ${purge.length}`)
const total = await sql`select count(*)::int as n from projects`
ok(total[0].n === 10, '10 projets scannés toujours intacts', `${total[0].n}`)
const taches = await sql`select count(*)::int as n from tasks`
ok(taches[0].n === 1, 'ta tâche « Aller a alger » toujours là', `${taches[0].n}`)

await sql.end({ timeout: 1 })
console.log(`\n=== ${ko === 0 ? `S2→S5 : ${n}/${n} VERTS` : `${ko} ÉCHEC(S) sur ${n}`} ===`)
process.exit(ko === 0 ? 0 : 1)
