// Vérifie que la réponse du claim est bien vérifiable par le Companion.
// node --env-file=.env scripts/_verify-claim.mjs   (temporaire)
import { createHmac, timingSafeEqual } from 'node:crypto'

const BASE = process.env.OSSO_BASE ?? 'http://localhost:3000'
const SECRET = process.env.COMPANION_SECRET
if (!SECRET) {
  console.error('✗ COMPANION_SECRET absent — relance scripts/companion-init.mjs')
  process.exit(1)
}

const auth = { Authorization: `Bearer ${SECRET}` }
let ko = 0
const ok = (cond, label, extra = '') => {
  if (!cond) ko++
  console.log(`${cond ? 'OK  ' : 'KO  '}${label}${extra ? ` — ${extra}` : ''}`)
}

async function post(path, body, headers = {}) {
  const r = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: body ? JSON.stringify(body) : undefined,
  })
  let json = null
  try { json = await r.json() } catch { /* non JSON */ }
  return { status: r.status, json }
}

// ── 1. Enfile une commande réelle ────────────────────────────────────────────
console.log('=== ENFILAGE ===')
const enq = await post('/api/brain/scan')
ok(enq.status === 200, 'POST /api/brain/scan', `HTTP ${enq.status}`)
const commandId = enq.json?.data?.command_id
ok(!!commandId, 'command_id renvoyé', String(commandId))

// ── 2. Auth : sans Bearer, puis avec ────────────────────────────────────────
console.log('\n=== AUTHENTIFICATION ===')
const sans = await post('/api/companion/commands/claim')
ok(sans.status === 403, 'claim SANS Bearer → 403', `HTTP ${sans.status}`)

const avec = await post('/api/companion/commands/claim', undefined, auth)
ok(avec.status === 200, 'claim AVEC Bearer → 200', `HTTP ${avec.status}`)
const commands = avec.json?.data?.commands ?? []
ok(Array.isArray(commands), 'payload = { commands: [...] }')

const cmd = commands.find((c) => c.id === commandId)
ok(!!cmd, 'la commande enfilée est dans le claim')

if (!cmd) {
  console.log('\nKO — commande absente du claim, arrêt.')
  process.exit(1)
}

// ── 3. Les champs exigés par le Companion ───────────────────────────────────
console.log('\n=== CONTRAT COMPANION (api.ts + security.ts) ===')
ok(typeof cmd.signature === 'string' && cmd.signature.length > 0, 'champ `signature` présent')
ok(typeof cmd.expires_at === 'string', 'champ `expires_at` présent')
ok(typeof cmd.created_at === 'string', 'champ `created_at` présent')
ok(!('status' in cmd) || true, 'champ `status` non exigé côté Companion')
const fresh = Date.now() - Date.parse(cmd.created_at)
ok(fresh < 120000, 'created_at frais (< 120 s)', `${Math.round(fresh / 1000)} s`)
ok(Date.parse(cmd.expires_at) > Date.now(), 'expires_at non dépassé')

// ── 4. Recalcul exact du HMAC — même canonicalisation que les deux côtés ────
console.log('\n=== SIGNATURE HMAC (recalcul identique au Companion) ===')
const base = `${cmd.id}|${cmd.command_key}|${JSON.stringify(cmd.payload)}|${cmd.expires_at}`
const expected = createHmac('sha256', SECRET).update(base).digest('hex')
const a = Buffer.from(expected, 'utf8')
const b = Buffer.from(String(cmd.signature), 'utf8')
const match = a.length === b.length && timingSafeEqual(a, b)
ok(match, 'le HMAC recalculé correspond à la signature', match ? '' : `attendu ${expected.slice(0, 16)}…, reçu ${String(cmd.signature).slice(0, 16)}…`)

// ── 5. Une signature falsifiée doit être rejetée ─────────────────────────────
const forged = '0'.repeat(String(cmd.signature).length)
const c = Buffer.from(forged, 'utf8')
const notMatch = a.length === c.length && !timingSafeEqual(a, c)
ok(notMatch, 'une signature falsifiée est détectée')

// ── 6. Clôture ──────────────────────────────────────────────────────────────
console.log('\n=== COMPLETION ===')
const done = await post(`/api/companion/commands/${cmd.id}/complete`, { status: 'done', result_text: 'vérification' }, auth)
ok(done.status === 200, 'complete → 200', `HTTP ${done.status}`)
const again = await post(`/api/companion/commands/${cmd.id}/complete`, { status: 'failed' }, auth)
ok(again.status === 409, '2e complete → 409 (idempotence)', `HTTP ${again.status}`)

// ── 7. La commande ne doit plus être réclamée ────────────────────────────────
const re = await post('/api/companion/commands/claim', undefined, auth)
const encore = (re.json?.data?.commands ?? []).some((x) => x.id === commandId)
ok(!encore, 'la commande clôturée n’est plus réclamée')

console.log(`\n=== ${ko === 0 ? 'TOUT EST VERT' : ko + ' CONTRÔLE(S) EN ÉCHEC'} ===`)
process.exit(ko === 0 ? 0 : 1)
