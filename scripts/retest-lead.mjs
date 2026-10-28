// Re-test des scénarios S5/S6 (bouton LEAD) — node scripts/retest-lead.mjs
// Le pont local étant désormais actif, on vérifie le rendu du prompt et ses effets de bord.
import { existsSync, mkdirSync, rmSync } from 'node:fs'
import postgres from 'postgres'

const BASE = process.env.OSSO_BASE ?? 'http://localhost:3000'
const DEV_ROOT = 'C:/Users/Sofiane/Desktop/dev'
const TEST_DIR = `${DEV_ROOT}/osso-retest`
const TEST_NAME = `osso-retest-${Date.now().toString(36)}`

let ko = 0
const ok = (cond, label, extra = '') => {
  if (!cond) ko++
  console.log(`${cond ? 'OK  ' : 'KO  '} ${label}${extra ? ` — ${extra}` : ''}`)
}

async function api(path, options = {}) {
  const res = await fetch(`${BASE}${path}`, {
    method: options.method ?? 'GET',
    headers: { 'content-type': 'application/json' },
    body: options.body ? JSON.stringify(options.body) : undefined,
  })
  const json = await res.json().catch(() => null)
  return { status: res.status, json }
}

const sql = postgres(process.env.DATABASE_URL, { max: 1, ssl: 'require' })
const countLead = async () => Number((await sql`select count(*)::int as n from lead_sessions`)[0].n)

// --- 0. environnement ---
mkdirSync(TEST_DIR, { recursive: true })
const promptBefore = existsSync(`${TEST_DIR}/prompt.md`)
ok(!promptBefore, 'dossier de test vierge (pas de prompt.md)')

console.log('\n--- S5 : checklist, réordonnancement et aperçu LEAD ---')
const before = await countLead()

const p = await api('/api/projects', {
  method: 'POST',
  body: { name: TEST_NAME, folder_path: TEST_DIR },
})
ok(p.status === 200, 'création du projet', `HTTP ${p.status}`)
const projectId = p.json?.data?.id
if (!projectId) { console.log('KO   abort : pas de projet'); process.exit(1) }

const titles = ['Alpha', 'Bravo', 'Charlie', 'Delta']
for (const t of titles) {
  const r = await api(`/api/projects/${projectId}/tasks`, { method: 'POST', body: { title: t } })
  if (r.status !== 200) ok(false, `tâche ${t}`, `HTTP ${r.status}`)
}
const desired = ['Delta', 'Bravo', 'Alpha', 'Charlie']
const ids = (await api(`/api/projects/${projectId}/tasks`)).json.data
const ordered = desired.map((name) => ids.find((x) => x.title === name)?.id).filter(Boolean)
const re = await api(`/api/projects/${projectId}/tasks/reorder`, {
  method: 'POST',
  body: { order: ordered },
})
ok(re.status === 200, 'réordonnancement', `HTTP ${re.status}`)

const afterReorder = (await api(`/api/projects/${projectId}/tasks`)).json.data
  .sort((a, b) => a.position - b.position)
  .map((x) => x.title)
ok(JSON.stringify(afterReorder) === JSON.stringify(desired), 'ordre persisté', afterReorder.join(' → '))

// --- aperçu ---
const prev = await api(`/api/projects/${projectId}/lead/preview`)
ok(prev.status === 200, 'GET lead/preview', `HTTP ${prev.status} ${prev.json?.error?.message ?? ''}`)
const preview = prev.json?.data
const prompt = preview?.prompt ?? ''

ok(preview?.taskCount === 4, 'taskCount = 4', `obtenu ${preview?.taskCount}`)
ok(prompt.includes(TEST_NAME), 'le prompt contient le nom du projet')
ok(prompt.includes(TEST_DIR), 'le prompt contient le chemin du dossier')
ok(preview?.placeholderFound === true, 'placeholderFound = true (template par défaut)')
const foundIdx = desired.map((t) => prompt.indexOf(t))
ok(foundIdx.every((i) => i >= 0), 'les 4 tâches sont dans le prompt')
ok(
  JSON.stringify(foundIdx) === JSON.stringify([...foundIdx].sort((a, b) => a - b)),
  'les tâches sont dans le bon ordre',
  foundIdx.join(','),
)

const after = await countLead()
ok(after === before, 'aperçu SANS effet de bord (lead_sessions inchangé)', `${before} → ${after}`)
ok(!existsSync(`${TEST_DIR}/prompt.md`), 'aperçu SANS écriture disque')

console.log('\n--- S6 : template d\'intro modifiable ---')
const s0 = (await api('/api/settings')).json.data
const MARKER = 'SENTINELLE_QA_S6'

// S6.3 — template SANS {{TACHES}}
await api('/api/settings', {
  method: 'PUT',
  body: { ...s0, leadIntroTemplate: `INTRO ${MARKER} \n\nFin du message.` },
})
const noPh = (await api(`/api/projects/${projectId}/lead/preview`)).json.data
ok(noPh?.placeholderFound === false, 'S6.3 placeholderFound = false sans {{TACHES}}')
ok(noPh?.prompt?.includes(MARKER), 'S6.3 la sentinelle du template est présente')
ok(noPh?.prompt?.endsWith('Fin du message.') === false, 'S6.3 la liste est APPENDÉE en fin (pas laissée en dernier)')
ok(desired.every((t) => noPh.prompt.includes(t)), 'S6.3 les 4 tâches sont en fin de prompt')
const markerIdx = noPh.prompt.indexOf(MARKER)
const firstTaskIdx = noPh.prompt.indexOf(desired[0])
ok(markerIdx >= 0 && firstTaskIdx > markerIdx, 'S6.3 la liste vient APRÈS le corps du template')

// S6.4 — template AVEC {{TACHES}}
await api('/api/settings', {
  method: 'PUT',
  body: { ...s0, leadIntroTemplate: `DEBUT avant\n{{TACHES}}\nAPRES fin` },
})
const withPh = (await api(`/api/projects/${projectId}/lead/preview`)).json.data
ok(withPh?.placeholderFound === true, 'S6.4 placeholderFound = true avec {{TACHES}}')
ok(withPh?.prompt?.includes('DEBUT avant') && withPh?.prompt?.includes('APRES fin'), 'S6.4 le corps est conservé')
const atPh = withPh.prompt.indexOf('Alpha')
const afterPh = withPh.prompt.indexOf('APRES fin')
ok(atPh >= 0 && afterPh > atPh, 'S6.4 la liste est insérée À LA POSITION du marqueur')

// restauration
await api('/api/settings', { method: 'PUT', body: { ...s0, leadIntroTemplate: s0.leadIntroTemplate } })
const restored = (await api('/api/settings')).json.data
ok(restored.leadIntroTemplate === s0.leadIntroTemplate, 'template par défaut restauré')

console.log('\n--- nettoyage ---')
const del = await api(`/api/projects/${projectId}`, { method: 'DELETE' })
ok(del.status === 200, 'projet de test supprimé', `HTTP ${del.status}`)
rmSync(TEST_DIR, { recursive: true, force: true })
ok(!existsSync(TEST_DIR), 'dossier de test supprimé du disque')
const left = await countLead()
ok(left === before, 'lead_sessions toujours à', String(left))

await sql.end({ timeout: 1 })
console.log(`\n=== ${ko === 0 ? 'S5 / S6 : TOUS LES CONTRÔLES PASSENT' : ko + ' CONTRÔLE(S) EN ÉCHEC'} ===`)
process.exit(ko === 0 ? 0 : 1)
