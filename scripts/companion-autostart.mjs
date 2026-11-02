/**
 * Active (ou retire) le démarrage automatique du Companion à la connexion
 * Windows — **sans droits administrateur** et **sans flash de console**.
 *
 *   node scripts/companion-autostart.mjs           # activer
 *   node scripts/companion-autostart.mjs --remove  # retirer
 *
 * Méthode : un `.vbs` dans le dossier Démarrage de l'utilisateur
 * (`shell:startup`), qui lance `start.ps1` via `WScript.Shell.Run(cmd, 0, False)`
 * — le `0` signifie fenêtre **complètement cachée**, le `False` que le script ne
 * bloque pas la connexion.
 *
 * Pourquoi pas `schtasks /SC ONLOGON` : la création d'une tâche ONLOGON dans le
 * dossier racine exige une invite d'administration (« Accès refusé » sinon), et
 * ce script doit fonctionner pour un utilisateur standard. Le dossier Démarrage,
 * lui, est écrit par n'importe qui — et le `.vbs` évite le flash de console
 * qu'aurait un raccourci `.lnk` ou un `.ps1` posé là brut.
 *
 * Idempotent : le `.vbs` est réécrit à chaque exécution, jamais dupliqué.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)))
const TASK_MARK = 'osso-companion.vbs'

/** Dossier Démarrage de l'utilisateur — pas besoin d'admin. */
const STARTUP_DIR = join(
  process.env.APPDATA ?? '',
  'Microsoft',
  'Windows',
  'Start Menu',
  'Programs',
  'Startup',
)

/** Où `start.ps1` peut se trouver, dans l'ordre de priorité. */
function locateStartScript() {
  const candidats = [
    join(process.env.APPDATA ?? '', 'osso-companion', 'start.ps1'),
    join(ROOT, 'companion', 'start.ps1'),
  ]
  return candidats.find((p) => existsSync(p)) ?? null
}

/**
 * Génère `start.ps1` s'il est absent : il lance Node en fenêtre cachée avec le
 * bon répertoire de travail. Les chemins sont absolus et propres à la machine,
 * d'où une génération à la volée plutôt qu'un fichier versionné.
 */
function ensureStartScript() {
  const existant = locateStartScript()
  if (existant !== null) return existant

  const cible = join(process.env.APPDATA ?? '', 'osso-companion', 'start.ps1')
  const node = join(process.env.PROGRAMFILES ?? 'C:\\Program Files', 'nodejs', 'node.exe')
  const entry = join(ROOT, 'companion', 'src', 'index.ts')
  const workingDir = join(ROOT, 'companion')

  mkdirSync(dirname(cible), { recursive: true })
  writeFileSync(
    cible,
    [
      "$ErrorActionPreference = 'Stop'",
      `Start-Process -FilePath '${node}' -ArgumentList '${entry}' -WorkingDirectory '${workingDir}' -WindowStyle Hidden`,
      '',
    ].join('\r\n'),
    'utf8',
  )
  console.log(`✔ start.ps1 généré : ${cible}`)
  return cible
}

/** Contenu du lanceur caché. `0` = fenêtre invisible, `False` = non bloquant. */
function buildVbs(startScript) {
  // Dans un littéral VBS, un guillemet s'échappe en "".
  const commande = `powershell.exe -NoProfile -WindowStyle Hidden -File "${startScript}"`
  const echappe = commande.replace(/"/g, '""')
  return [
    "' OSSO Companion — lance le processus au login, en fenêtre cachée.",
    'Set sh = CreateObject("WScript.Shell")',
    `sh.Run "${echappe}", 0, False`,
    '',
  ].join('\r\n')
}

const retirer = process.argv.includes('--remove')
const cible = join(STARTUP_DIR, TASK_MARK)

if (retirer) {
  if (existsSync(cible)) {
    rmSync(cible, { force: true })
    console.log(`✔ Retiré : ${cible}`)
    console.log('  Le Companion ne démarrera plus automatiquement au login.')
  } else {
    console.log(`· Rien à retirer : ${cible} n'existait pas.`)
  }
  process.exit(0)
}

const startScript = ensureStartScript()

mkdirSync(STARTUP_DIR, { recursive: true })
writeFileSync(cible, buildVbs(startScript), 'utf8')

console.log('✔ Démarrage automatique activé (aucun droit admin requis).')
console.log(`  Lanceur : ${cible}`)
console.log(`  Cible   : ${startScript}`)
console.log('\nVérification du contenu :')
console.log(readFileSync(cible, 'utf8').trim())
console.log('\nÀ la prochaine connexion Windows, l’icône du Companion apparaîtra.')
console.log('Pour annuler : node scripts/companion-autostart.mjs --remove')
