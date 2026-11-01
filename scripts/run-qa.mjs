#!/usr/bin/env node
/**
 * Runner unifié des suites QA OSSO — cible de `npm test`.
 *
 * Contexte : le middleware `server/middleware/auth.ts` protège désormais
 * **toutes** les routes sauf `/connexion`, `/api/auth/*` et `/api/companion/*`.
 * Les campagnes historiques (`qa-api`, `verify-companion-contract`) ciblent des
 * routes comme `/api/brain/scan` et reçoivent donc un 401 tant qu'elles n'ont
 * pas de session. Ce runner se connecte **une fois** via `/api/auth/login`,
 * puis transmet le cookie obtenu à chaque enfant via `OSSO_SESSION_COOKIE`.
 *
 * Aucun by-pass n'est ajouté côté serveur : on réutilise le vrai chemin
 * d'authentification, exactement comme le ferait un navigateur.
 *
 * Prérequis :
 *   - le serveur répond sur `OSSO_BASE` (par défaut http://localhost:3000)
 *   - `.env` renseigné : `DASHBOARD_PASSWORD`, `COMPANION_SECRET`, `DATABASE_URL`
 *   - la suite `companion-e2e` exige en plus le tray Companion en ligne ;
 *     à défaut elle est SKIP (et non FAIL) — un déploiement CI n'a pas de tray.
 *
 * Code de sortie : 0 si aucune suite n'a échoué (les SKIP ne font pas échouer),
 * 1 sinon.
 */
import { spawn } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import process from 'node:process'

const ROOT = process.cwd()
const BASE = process.env.OSSO_BASE ?? 'http://localhost:3000'

/** Timeout par suite (ms) — la boucle e2e peut attendre ~80 s de heartbeat. */
const SUITE_TIMEOUT_MS = 180_000

/** Suites, dans l'ordre d'exécution. */
const SUITES = [
  {
    id: 'api',
    label: 'Campagne API (auth · atomicité · expiration · chemins)',
    script: 'scripts/qa-api.mjs',
    needsSession: true,
    needsCompanion: false,
  },
  {
    id: 'contract',
    label: 'Contrat Companion (enfilage → claim vérifiable)',
    script: 'scripts/verify-companion-contract.mjs',
    needsSession: true,
    needsCompanion: false,
  },
  {
    id: 'companion-e2e',
    label: 'E2E boucle Companion (présence → clôture)',
    script: 'scripts/qa-companion-e2e.mjs',
    needsSession: false,
    needsCompanion: true,
  },
]

/* ══ Chargement du .env ═══════════════════════════════════════════════════ */

/**
 * Parse un fichier `.env` de façon minimale mais robuste : commentaires,
 * lignes vides, guillemets simples/doubles, `export ` préfixe.
 * Ne **écrase** jamais une variable déjà présente dans `process.env`
 * (une var d'invite de commande prime sur le fichier).
 */
function loadEnvFile(file) {
  if (!existsSync(file)) return { loaded: 0, missing: true }
  const lines = readFileSync(file, 'utf8').split(/\r?\n/)
  let loaded = 0
  for (const raw of lines) {
    const line = raw.trim()
    if (line.length === 0 || line.startsWith('#')) continue
    const withoutExport = line.startsWith('export ') ? line.slice(7) : line
    const eq = withoutExport.indexOf('=')
    if (eq <= 0) continue
    const key = withoutExport.slice(0, eq).trim()
    let value = withoutExport.slice(eq + 1).trim()
    if (
      (value.startsWith('"') && value.endsWith('"') && value.length >= 2) ||
      (value.startsWith("'") && value.endsWith("'") && value.length >= 2)
    ) {
      value = value.slice(1, -1)
    }
    if (process.env[key] === undefined) {
      process.env[key] = value
      loaded++
    }
  }
  return { loaded, missing: false }
}

/* ══ Préflight ════════════════════════════════════════════════════════════ */

/** GET JSON tolerant : ne lève jamais, renvoie `{ status, json }`. */
async function getJson(pathname) {
  try {
    const r = await fetch(`${BASE}${pathname}`)
    let json = null
    try {
      json = await r.json()
    } catch {
      /* non-JSON : on garde le statut */
    }
    return { status: r.status, json }
  } catch (err) {
    return { status: 0, json: null, error: String(err) }
  }
}

/** Connexion : POST /api/auth/login → chaîne de cookie `osso_session=…`. */
async function login(password) {
  const r = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ password }),
  })
  if (!r.ok) return { ok: false, status: r.status }

  // `getSetCookie()` est disponible sur Response depuis Node 20.
  const setCookies = typeof r.headers.getSetCookie === 'function' ? r.headers.getSetCookie() : []
  const session = setCookies
    .filter((c) => c.startsWith('osso_session='))
    .map((c) => c.split(';', 1)[0])[0]
  return session ? { ok: true, cookie: session } : { ok: false, status: r.status, noCookie: true }
}

/* ══ Exécution d'une suite ════════════════════════════════════════════════ */

/** Lance un script Node en enfant, flux stdout/stderr en direct. */
function runScript(script, env) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [script], {
      cwd: ROOT,
      env: { ...process.env, ...env },
      stdio: 'inherit',
      shell: false,
    })
    const timer = setTimeout(() => {
      child.kill('SIGKILL')
      resolve({ code: -1, timedOut: true })
    }, SUITE_TIMEOUT_MS)

    child.on('error', (err) => {
      clearTimeout(timer)
      resolve({ code: -1, error: String(err) })
    })
    child.on('close', (code) => {
      clearTimeout(timer)
      resolve({ code: code ?? -1 })
    })
  })
}

/* ══ Principal ════════════════════════════════════════════════════════════ */

async function main() {
  const env = loadEnvFile(path.join(ROOT, '.env'))
  const separator = '═'.repeat(64)

  console.log(separator)
  console.log('QA OSSO — runner unifié')
  console.log(`  base   : ${BASE}`)
  console.log(`  .env   : ${env.missing ? 'ABSENT' : `${env.loaded} variable(s) chargée(s)`}`)
  console.log(separator)

  // ── Préflight serveur ────────────────────────────────────────────────────
  const status = await getJson('/api/companion/status')
  if (status.status === 0) {
    console.error(`\n✗ Serveur injoignable sur ${BASE} — lance \`npm run dev\` puis relance \`npm test\`.`)
    process.exit(1)
  }
  if (status.status === 501) {
    console.error('\n✗ 501 : DASHBOARD_PASSWORD absent ou vide (fail-closed). Comble-le dans .env.')
    process.exit(1)
  }
  console.log(`\n✓ serveur joignable (GET /api/companion/status → HTTP ${status.status})`)

  // ── Préflight secrets ────────────────────────────────────────────────────
  const manquants = []
  if (!process.env.COMPANION_SECRET) manquants.push('COMPANION_SECRET')
  if (!process.env.DASHBOARD_PASSWORD) manquants.push('DASHBOARD_PASSWORD')
  if (!process.env.DATABASE_URL) manquants.push('DATABASE_URL')
  if (manquants.length > 0) {
    console.error(`\n✗ Variables manquantes dans .env : ${manquants.join(', ')}`)
    if (manquants.includes('COMPANION_SECRET')) {
      console.error('  → lance scripts/companion-init.mjs pour générer le secret Companion.')
    }
    process.exit(1)
  }
  console.log('✓ secrets présents (COMPANION_SECRET, DASHBOARD_PASSWORD, DATABASE_URL)')

  // ── Connexion (une seule fois) ───────────────────────────────────────────
  const session = await login(process.env.DASHBOARD_PASSWORD)
  if (!session.ok) {
    console.error(`\n✗ Connexion refusée (HTTP ${session.status}). Mot de passe .env incohérent ?`)
    process.exit(1)
  }
  console.log('✓ session ouverte via /api/auth/login (cookie transmis aux suites)')

  // ── Companion ────────────────────────────────────────────────────────────
  const companionOnline = status.json?.data?.available === true
  console.log(
    companionOnline
      ? '✓ Companion en ligne'
      : '· Companion hors ligne — la suite e2e sera SKIP (tray non démarré)',
  )

  // ── Exécution ────────────────────────────────────────────────────────────
  const resultats = []
  for (const suite of SUITES) {
    const scriptPath = path.join(ROOT, suite.script)
    if (!existsSync(scriptPath)) {
      resultats.push({ ...suite, etat: 'MANQUANT', detail: `script introuvable : ${suite.script}` })
      continue
    }
    if (suite.needsCompanion && !companionOnline) {
      resultats.push({
        ...suite,
        etat: 'SKIP',
        detail: 'Companion hors ligne (lance le tray puis relance)',
      })
      continue
    }

    console.log(`\n${separator}\n▶ ${suite.label}\n  ${suite.script}\n${separator}`)
    const run = await runScript(suite.script, {
      OSSO_SESSION_COOKIE: session.cookie,
      OSSO_BASE: BASE,
    })
    let etat = run.code === 0 ? 'OK' : 'KO'
    let detail = `code ${run.code}`
    if (run.timedOut) {
      etat = 'KO'
      detail = `timeout après ${SUITE_TIMEOUT_MS / 1000}s`
    } else if (run.error) {
      etat = 'KO'
      detail = run.error
    }
    resultats.push({ ...suite, etat, detail })
  }

  // ── Bilan ────────────────────────────────────────────────────────────────
  console.log(`\n${separator}\nBILAN\n${separator}`)
  const largeur = Math.max(...SUITES.map((s) => s.label.length))
  for (const r of resultats) {
    const pion = r.etat === 'OK' ? '✓' : r.etat === 'SKIP' ? '·' : '✗'
    const suffixe = r.etat === 'OK' ? '' : ` — ${r.detail}`
    console.log(`${pion} ${r.etat.padEnd(4)} ${r.label.padEnd(largeur)}${suffixe}`)
  }

  const ko = resultats.filter((r) => r.etat === 'KO' || r.etat === 'MANQUANT').length
  const skip = resultats.filter((r) => r.etat === 'SKIP').length
  console.log(
    `\n${resultats.length} suite(s) — ${resultats.length - ko - skip} OK, ${skip} SKIP, ${ko} KO`,
  )
  process.exit(ko === 0 ? 0 : 1)
}

main().catch((err) => {
  console.error('Erreur fatale du runner :', err)
  process.exit(1)
})
