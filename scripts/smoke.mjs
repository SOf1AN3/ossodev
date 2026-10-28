// Test de fumée OSSO — node --env-file=.env scripts/smoke.mjs
// Attend que le serveur démarre, puis frappe les endpoints principaux.
const BASE = process.env.OSSO_BASE ?? 'http://localhost:3000'

const ROUTES = [
  'GET /api/bridge/status',
  'GET /api/settings',
  'GET /api/tasks?view=today',
  'GET /api/tasks?from=2026-10-28&to=2026-11-03',
  'GET /api/routines',
  'GET /api/projects',
  'GET /api/ideas',
  'GET /api/gamification/summary',
  'GET /api/gamification/badges',
  'GET /api/gamification/records',
  'GET /api/gamification/missions/current',
  'GET /',
  'GET /aujourdhui',
  'GET /planifier',
  'GET /routines',
  'GET /idees',
  'GET /projets',
  'GET /reglages',
  'GET /progres',
]

async function probe(url) {
  try {
    const r = await fetch(url, { redirect: 'manual' })
    const text = await r.text()
    return { status: r.status, body: text }
  } catch (e) {
    return { status: 0, body: String(e?.message ?? e) }
  }
}

// --- attente du démarrage ---
let up = false
for (let i = 0; i < 90; i++) {
  const r = await probe(`${BASE}/api/bridge/status`)
  if (r.status === 200) { up = true; break }
  await new Promise((s) => setTimeout(s, 1000))
}
if (!up) {
  console.error('ECHEC — le serveur n\'a pas répondu en 90 s sur', BASE)
  process.exit(1)
}
console.log(`Serveur prêt sur ${BASE}\n`)

// --- routes ---
let ko = 0
for (const route of ROUTES) {
  const [method, path] = [route.slice(0, route.indexOf(' ')), route.slice(route.indexOf(' ') + 1)]
  const r = await probe(`${BASE}${path}`)
  const isHtml = path === '/' || !path.startsWith('/api/')
  const okStatus = r.status === 200
  const tag = okStatus ? 'OK  ' : 'KO  '
  if (!okStatus) ko++

  let detail = ''
  if (path.startsWith('/api/')) {
    try {
      const json = JSON.parse(r.body)
      if (json.error) detail = `ERREUR API: ${json.error.code} — ${json.error.message}`
      else if (Array.isArray(json.data)) detail = `data[] : ${json.data.length} élément(s)`
      else if (json.data && typeof json.data === 'object') {
        detail = 'data{ ' + Object.keys(json.data).slice(0, 7).join(', ')
        const extra = Object.keys(json.data).length > 7 ? ', …' : ''
        detail += extra + ' }'
      } else detail = String(json.data)
    } catch {
      detail = 'réponse non-JSON: ' + r.body.slice(0, 120)
      if (okStatus) ko++
    }
  } else {
    const title = /<title>([^<]*)<\/title>/.exec(r.body)?.[1]
    detail = `page${title ? ` « ${title} »` : ''} (${r.body.length} o)`
    // Vrai marqueur d'échec Nuxt (ne pas chercher "500" : présent dans les URLs de chunks)
    if (r.body.includes('Application error') || r.body.includes('nuxt-error-page') || r.body.includes('__NUXT_ERROR__')) {
      detail += ' ⚠️ page en erreur'
      ko++
    }
  }

  console.log(`${tag} ${method} ${path.padEnd(42)} ${detail}`)
}

// --- vérifications de contenu métier ---
console.log('\n--- contrôles de contenu ---')
const badges = await probe(`${BASE}/api/gamification/badges`)
try {
  const n = JSON.parse(badges.body).data.length
  console.log(`${n === 12 ? 'OK  ' : 'KO  '} badges : ${n} / 12 attendus`)
  if (n !== 12) ko++
} catch { console.log('KO   badges : lecture impossible'); ko++ }

const summary = await probe(`${BASE}/api/gamification/summary`)
try {
  const s = JSON.parse(summary.body).data
  const need = ['points', 'level', 'levelName', 'streak', 'bestStreak', 'doneToday', 'scheduledToday', 'completionRatio', 'newlyEarned']
  const missing = need.filter((k) => !(k in s))
  console.log(`${missing.length === 0 ? 'OK  ' : 'KO  '} summary : ${missing.length === 0 ? '8 champs + newlyEarned présents' : 'manquants → ' + missing.join(', ')}`)
  if (missing.length) ko++
} catch { console.log('KO   summary : lecture impossible'); ko++ }

const bad = await probe(`${BASE}/api/tasks?from=../../../etc/passwd&to=9999-99-99`)
console.log(`${bad.status === 400 || bad.status === 404 ? 'OK  ' : 'KO  '} injection date : HTTP ${bad.status}`)
if (bad.status !== 400 && bad.status !== 404) ko++

const nosql = await probe(`${BASE}/api/projects?id='; DROP TABLE projects;--`)
console.log(`${nosql.status < 500 ? 'OK  ' : 'KO  '} injection SQL : HTTP ${nosql.status}`)
if (nosql.status >= 500) ko++

console.log(`\n=== ${ko === 0 ? 'TOUS LES CONTRÔLES PASSENT' : ko + ' CONTRÔLE(S) EN ÉCHEC'} ===`)
process.exit(ko === 0 ? 0 : 1)
