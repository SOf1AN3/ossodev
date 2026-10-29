/**
 * Publie un cours d'apprentissage généré par l'agent `teacher` dans la base OSSO.
 *
 *   node <ossodir>/scripts/teacher-publish.mjs <payload.json>
 *
 * Transport : Teacher écrit un JSON temporaire (il n'a pas le droit d'écrire hors
 * de ~/.osso), ce script le consomme puis **le supprime lui-même** — Teacher n'a
 * pas la permission shell de `rm`.
 *
 * Payload attendu : { "technology": "vuejs", "title": "Vue.js", "content_md": "…" }
 *
 * Sortie : une seule ligne claire en français, succès ou échec. Code retour 0/1.
 */
import { existsSync, readFileSync, rmSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, isAbsolute, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import postgres from 'postgres'

const REPO_ROOT = dirname(dirname(fileURLToPath(import.meta.url)))

// ── Configuration : ~/.osso/teacher.json → { ossodir } ───────────────────────
function readTeacherConfig() {
  const p = join(homedir(), '.osso', 'teacher.json')
  if (!existsSync(p)) return null
  try {
    return JSON.parse(readFileSync(p, 'utf8'))
  } catch {
    return null
  }
}

/** DATABASE_URL : d'abord l'environnement, sinon le .env d'OSSO. */
function loadDatabaseUrl(ossodir) {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL
  const envPath = join(ossodir, '.env')
  if (!existsSync(envPath)) return null
  const content = readFileSync(envPath, 'utf8')
  const m = /^NUXT_DATABASE_URL=(.+)$/m.exec(content) ?? /^DATABASE_URL=(.+)$/m.exec(content)
  return m ? m[1].trim() : null
}

function fail(message, payloadPath) {
  console.error(`✗ Refusé : ${message}`)
  if (payloadPath && existsSync(payloadPath)) {
    try { rmSync(payloadPath, { force: true }) } catch { /* rien */ }
  }
  process.exit(1)
}

// ── 1. Arguments ─────────────────────────────────────────────────────────────
const payloadPath = process.argv[2]
if (!payloadPath) {
  fail('aucun fichier de payload fourni. Usage : node teacher-publish.mjs <payload.json>')
}
const absPayload = isAbsolute(payloadPath) ? payloadPath : resolve(process.cwd(), payloadPath)
if (!existsSync(absPayload)) {
  fail(`payload introuvable : ${absPayload}`)
}

// ── 2. Lecture + validation stricte ──────────────────────────────────────────
let payload
try {
  // `Set-Content -Encoding utf8` (PowerShell 5.1) écrit un BOM : JSON.parse
  // dessus lève. On l'absorbe — le payload peut venir de n'importe quel outil.
  const raw = readFileSync(absPayload, 'utf8').replace(/^﻿/, '').replace(/^﻿/, '')
  payload = JSON.parse(raw)
} catch {
  fail(`payload illisible ou JSON invalide : ${absPayload}`, absPayload)
}

const { technology, title, content_md: content } = payload

if (typeof technology !== 'string' || !/^[a-z0-9][a-z0-9-]{1,40}$/.test(technology)) {
  fail(`slug invalide « ${String(technology)} » (attendu : minuscules, chiffres, tirets)`, absPayload)
}
if (typeof title !== 'string' || title.trim().length < 1 || title.trim().length > 120) {
  fail('le titre doit faire entre 1 et 120 caractères', absPayload)
}
if (typeof content !== 'string') {
  fail('content_md absent', absPayload)
}
if (content.length < 500) {
  fail(`contenu trop court (${content.length} caractères, minimum 500)`, absPayload)
}
if (content.length > 200000) {
  fail(`contenu trop long (${content.length} caractères, maximum 200000)`, absPayload)
}
if (!content.includes('## ')) {
  fail('le cours doit contenir des sections (## …)', absPayload)
}
if (!content.includes('```mermaid')) {
  fail('ajoute au moins un diagramme Mermaid (bloc ```mermaid)', absPayload)
}
// Assainissement en entrée — le dashboard assainit aussi en sortie.
const dangerous = [/<\s*script/i, /javascript\s*:/i, /\son\w+\s*=/i]
for (const re of dangerous) {
  if (re.test(content)) {
    fail('contenu refusé : balise ou script détecté', absPayload)
  }
}

// ── 3. Connexion ─────────────────────────────────────────────────────────────
const config = readTeacherConfig()
const ossodir = config?.ossodir ?? REPO_ROOT
const url = loadDatabaseUrl(ossodir)
if (!url) {
  fail(
    `DATABASE_URL introuvable — vérifie ~/.osso/teacher.json (ossodir) et le .env d'OSSO`,
    absPayload,
  )
}

const sql = postgres(url, { max: 1, ssl: 'require' })

try {
  // Upsert : on réécrit le contenu mais on CONSERVE status et completed_at.
  // Un cours déjà « Accompli » reste Accompli après une réédition.
  const rows = await sql`
    insert into learning_courses (technology, title, content_md, updated_at)
    values (${technology}, ${title.trim()}, ${content}, now())
    on conflict (technology) do update
      set title = excluded.title,
          content_md = excluded.content_md,
          updated_at = now()
    returning technology, title, status, completed_at
  `

  const row = rows[0]
  const statut = row.status === 'done' ? 'Accompli (conservé)' : 'à lire'
  console.log(`✓ Cours publié : ${row.title} (${row.technology}) — ${statut}`)
} catch (err) {
  fail(`erreur base de données : ${err?.message ?? err}`, absPayload)
} finally {
  await sql.end({ timeout: 1 })
}

// ── 4. Nettoyage du payload (Teacher n'a pas le droit de rm) ─────────────────
try {
  rmSync(absPayload, { force: true })
} catch {
  console.error(`⚠ Impossible de supprimer le payload : ${absPayload}`)
}
