/**
 * Initialise le Companion Node : génère le secret partagé et écrit la
 * configuration locale. Idempotent — relançable sans tout casser.
 *
 *   node --env-file=.env scripts/companion-init.mjs           (crée ou réutilise)
 *   node --env-file=.env scripts/companion-init.mjs --rotate  (force un nouveau secret)
 *
 * Deux écritures, une seule source de vérité :
 *   1. `.env` du projet                → COMPANION_SECRET  (côté serveur Nitro)
 *   2. `%APPDATA%\osso-companion\config.json` → { secret, oss_url, ... } (côté Companion)
 *
 * Le secret n'est JAMAIS affiché en clair, jamais commité, jamais envoyé à Supabase.
 */
import { randomBytes } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)))
const ENV_PATH = join(ROOT, '.env')

const ROTATE = process.argv.includes('--rotate')

/** Répertoire de config du Companion : %APPDATA%\osso-companion */
function companionDir() {
  const base = process.env.APPDATA || join(homedir(), 'AppData', 'Roaming')
  return join(base, 'osso-companion')
}

function readEnv() {
  if (!existsSync(ENV_PATH)) return ''
  return readFileSync(ENV_PATH, 'utf8')
}

/** Extrait ou crée COMPANION_SECRET dans le contenu .env, en conservant le reste. */
function upsertEnvSecret(content, secret) {
  const line = `COMPANION_SECRET=${secret}`
  const re = /^COMPANION_SECRET=.*$/m
  if (re.test(content)) return content.replace(re, line)
  const trimmed = content.replace(/\s*$/, '')
  return `${trimmed}\n${trimmed ? '\n' : ''}${line}\n`
}

function mask(secret) {
  return `${secret.slice(0, 8)}…(${secret.length} caractères)`
}

// ── 1. Secret ────────────────────────────────────────────────────────────────
const envContent = readEnv()
const existing = /^COMPANION_SECRET=(.+)$/m.exec(envContent)?.[1]?.trim()

let secret
if (existing && !ROTATE) {
  secret = existing
  console.log(`Secret déjà présent — réutilisé : ${mask(secret)}`)
} else {
  secret = randomBytes(48).toString('base64url')
  writeFileSync(ENV_PATH, upsertEnvSecret(envContent, secret), 'utf8')
  console.log(`${ROTATE ? 'Nouveau secret généré' : 'Secret généré'} : ${mask(secret)}`)
  console.log(`  → écrit dans ${ENV_PATH}`)
}

// ── 2. Config locale du Companion ────────────────────────────────────────────
const dir = companionDir()
mkdirSync(dir, { recursive: true })
const configPath = join(dir, 'config.json')

/** Valeurs par défaut conservées si le fichier existe déjà (l'utilisateur peut
 *  avoir renseigné une URL ou une commande propre à sa machine). */
const defaults = {
  oss_url: 'http://localhost:3000',
  secret,
  dev_root: process.env.NUXT_DEV_ROOT_PATH || 'C:/Users/Sofiane/Desktop/dev',
  brain_command: '',
  terminal_command: 'cmd /k cd /d "{{DOSSIER}}" && opencode',
  poll_interval_ms: 7000,
}

let config = { ...defaults }
if (existsSync(configPath) && !ROTATE) {
  try {
    const previous = JSON.parse(readFileSync(configPath, 'utf8'))
    // Le secret suit toujours la valeur fraîche, les réglages locaux sont conservés.
    config = { ...defaults, ...previous, secret }
    console.log(`Config existante conservée — ${configPath}`)
  } catch {
    console.log(`Config illisible — réécriture complète — ${configPath}`)
  }
}

writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`, 'utf8')
console.log(`  → écrit dans ${configPath}`)

// ── 3. Résumé ────────────────────────────────────────────────────────────────
const reveal = process.argv.includes('--show-secret')
console.log('\n=== Résumé Companion ===')
console.log(`  OSSO            ${config.oss_url}`)
console.log(`  Dossier dev     ${config.dev_root}`)
console.log(`  Polling         ${config.poll_interval_ms} ms`)
console.log(`  Commande brain  ${config.brain_command || '(non configurée — le dashboard affichera la commande à copier)'}`)
console.log(`  Commande term.  ${config.terminal_command}`)
console.log(`  Secret          ${reveal ? secret : mask(secret)}`)
if (!reveal) console.log('                  (relancer avec --show-secret pour l’afficher)')

console.log('\nProchaine étape :')
console.log('  1. node companion/scripts/register-task.ts   → démarrage au lancement')
console.log('  2. npm run companion:dev                     → lancer le tray')
