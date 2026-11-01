/**
 * Crée (ou recrée) la tâche planifiée Windows `OSSO-Companion` : le Companion
 * démarre automatiquement à chaque connexion, sans flash de console.
 *
 * Méthode : tâche planifiée `schtasks /SC ONLOGON` — PAS le dossier
 * `shell:startup` (un `.lnk` ou `.ps1` y ouvrirait une fenêtre de console).
 *
 *   node scripts/companion-autostart.mjs
 *
 * Idempotent : la tâche existante est supprimée puis recréée. En cas de refus
 * de `schtasks` (droits insuffisants), la commande manuelle est affichée et le
 * script se termine avec un code de sortie non nul — sans planter le lot.
 */
import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)))
const COMPANION_DIR = join(ROOT, 'companion')
const START_PS1 = join(COMPANION_DIR, 'start.ps1')
const TASK_NAME = 'OSSO-Companion'

/** Commande cible de la tâche : PowerShell caché qui lance `start.ps1`. */
const TARGET_COMMAND = `powershell.exe -NoProfile -WindowStyle Hidden -File "${START_PS1}"`

/**
 * Exécute `schtasks.exe` avec un tableau d'arguments — jamais une chaîne
 * concaténée passée à un shell interprété. Le répertoire de travail du
 * lancement est `companion/` : `schtasks` n'expose aucun équivalent pour la
 * tâche elle-même, d'où le chemin absolu vers `start.ps1`.
 */
function schtasks(args) {
  return spawnSync('schtasks.exe', args, {
    cwd: COMPANION_DIR,
    encoding: 'utf8',
    windowsHide: true,
  })
}

/** Commande complète à recopier dans une invite d'administration si besoin. */
function manualCommand() {
  const escaped = TARGET_COMMAND.replace(/"/g, '\\"')
  return `schtasks /Create /TN ${TASK_NAME} /TR "${escaped}" /SC ONLOGON /F`
}

/** Affiche l'état courant de la tâche (best effort). */
function printTaskState() {
  console.log(`\nÉtat de la tâche ${TASK_NAME} :`)
  const state = schtasks(['/Query', '/TN', TASK_NAME])
  const detail = (state.stderr || state.stdout || '').trim()
  if (state.status === 0 && detail.length > 0) {
    console.log(detail)
  } else {
    console.log(`  introuvable${detail.length > 0 ? ` — ${detail}` : ''}`)
  }
}

if (!existsSync(START_PS1)) {
  console.warn(`⚠ Avertissement : introuvable ${START_PS1}`)
  console.warn('  La tâche sera créée, mais échouera au login tant que ce fichier n’existe pas.')
}

// 1. Suppression idempotente (sans effet si la tâche n’existe pas encore).
const deletion = schtasks(['/Delete', '/TN', TASK_NAME, '/F'])
if (deletion.status === 0) {
  console.log(`Tâche ${TASK_NAME} existante supprimée — recréation.`)
}

// 2. Création de la tâche de démarrage au login.
const creation = schtasks([
  '/Create',
  '/TN',
  TASK_NAME,
  '/TR',
  TARGET_COMMAND,
  '/SC',
  'ONLOGON',
  '/F',
])

if (creation.error != null || creation.status !== 0) {
  const detail =
    creation.error != null
      ? creation.error.message
      : (creation.stderr || creation.stdout || '').trim()
  console.error(`✖ Échec de la création de la tâche ${TASK_NAME}.`)
  if (detail.length > 0) console.error(`  ${detail}`)
  console.error('\nExécute cette commande manuellement dans une invite d’administration :')
  console.error(`  ${manualCommand()}`)
  printTaskState()
  process.exitCode = 1
} else {
  console.log(`✔ Tâche ${TASK_NAME} créée : le Companion démarrera au login Windows.`)
  console.log(`  Cible : ${TARGET_COMMAND}`)
  printTaskState()
}
