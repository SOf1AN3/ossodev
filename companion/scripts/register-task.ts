/**
 * Crée la tâche planifiée Windows « OSSO Companion » (déclenchement : à la
 * connexion) qui lance le Companion sans fenêtre visible.
 *
 * - `schtasks` via `spawn` avec args en tableau (`shell: false`).
 * - Idempotent : la tâche existante est supprimée puis recréée.
 * - Aucun privilège administrateur requis (tâche de l'utilisateur courant,
 *   déclencheur « à la connexion » = ONLOGON pour l'utilisateur connecté).
 *
 * Usage : `npm run register` (depuis companion/)
 */

import { spawn } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const TASK_NAME = 'OSSO Companion'
const TASK_DIR = '\\OSSO'

interface SchtasksResult {
  code: number | null
  output: string
}

/** Exécute schtasks.exe avec des args en tableau — jamais d'interprétation shell. */
function runSchtasks(args: string[]): Promise<SchtasksResult> {
  return new Promise((resolve, reject) => {
    let output = ''
    let child
    try {
      child = spawn('schtasks.exe', args, {
        shell: false,
        windowsHide: true,
        stdio: ['ignore', 'pipe', 'pipe'],
      })
    } catch (error) {
      reject(error instanceof Error ? error : new Error(String(error)))
      return
    }
    child.stdout.setEncoding('utf8')
    child.stderr.setEncoding('utf8')
    child.stdout.on('data', (chunk: string) => {
      output += chunk
    })
    child.stderr.on('data', (chunk: string) => {
      output += chunk
    })
    child.on('error', (error) => {
      reject(error)
    })
    child.on('close', (code) => {
      resolve({ code, output: output.trim() })
    })
  })
}

function out(line: string): void {
  process.stdout.write(`${line}\n`)
}

function outError(line: string): void {
  process.stderr.write(`${line}\n`)
}

async function main(): Promise<void> {
  const scriptDir = path.dirname(fileURLToPath(import.meta.url))
  const companionDir = path.resolve(scriptDir, '..')
  const entry = path.join(companionDir, 'src', 'index.ts')
  const nodeExe = process.execPath

  // `schtasks /TR` est limité à 261 caractères : on écrit donc un script de
  // lancement court dans le dossier du Companion, et la tâche pointe vers lui.
  const dataDir = process.env.APPDATA
  if (dataDir === undefined || dataDir.length === 0) {
    outError('✗ Variable APPDATA introuvable.')
    process.exitCode = 1
    return
  }
  const companionDataDir = path.join(dataDir, 'osso-companion')
  const launcher = path.join(companionDataDir, 'start.ps1')
  fs.mkdirSync(companionDataDir, { recursive: true })

  const q = (value: string): string => `'${value.replace(/'/g, "''")}'`
  // PowerShell caché → node lancé sans console visible, cwd = dossier companion.
  // Node >= 22.18 exécute les .ts en type stripping natif.
  const launcherContent = [
    '$ErrorActionPreference = \'Stop\'',
    `Start-Process -FilePath ${q(nodeExe)} -ArgumentList ${q(entry)} -WorkingDirectory ${q(companionDir)} -WindowStyle Hidden`,
    '',
  ].join('\r\n')
  fs.writeFileSync(launcher, launcherContent, 'utf8')

  // Ligne de la tâche : courte, telle quelle, sans interprétation de shell.
  const launchCommand =
    `powershell.exe -NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File "${launcher}"`

  out('─'.repeat(64))
  out(`Tâche planifiée : ${TASK_NAME}`)
  out(`  Déclenchement  : à la connexion (ONLOGON)`)
  out(`  Entrée         : ${entry}`)
  out(`  Node           : ${nodeExe}`)
  out(`  Script lanceur : ${launcher}`)
  out(`  Commande tâche : ${launchCommand}`)
  out('─'.repeat(64))

  // 1. Suppression de l'éventuelle tâche existante (idempotence).
  const del = await runSchtasks(['/Delete', '/TN', `${TASK_DIR}\\${TASK_NAME}`, '/F'])
  if (del.code === 0) {
    out('• Ancienne tâche supprimée (recréation).')
  }

  // 2. Création (l'ancienne a été supprimée, ou n'existait pas).
  const create = await runSchtasks([
    '/Create',
    '/TN', `${TASK_DIR}\\${TASK_NAME}`,
    '/TR', launchCommand,
    '/SC', 'ONLOGON',
    '/RL', 'LIMITED',
    '/F',
  ])

  if (create.code !== 0) {
    outError('✗ Échec de la création de la tâche :')
    if (create.output.length > 0) outError(`  ${create.output}`)
    // L'encodage OEM de schtasks peut corrompre les accents → détection souple.
    const accessDenied = /acc\S{0,4}s\s*refus|access is denied|refus/i.test(create.output)
    if (accessDenied) {
      outError('')
      outError('  Cause : la création d’une tâche de type « à la connexion » (ONLOGON)')
      outError('  exige un token administrateur délégué — ton session tourne en')
      outError('  « niveau obligatoire moyen » (UAC sans élévation), et ce même pour')
      outError('  un compte membre de Administrateurs.')
      outError('')
      outError('  Solution : relance ce script depuis un terminal ADMINISTRATEUR :')
      outError(`      npm run register`)
      outError('  (ouvrir l’invite de commandes en « Exécuter en tant qu’administrateur »)')
      outError('')
      outError('  Aucune autre élévation n’est nécessaire : un seul passage admin ici,')
      outError('  la tâche tourne ensuite en standard à chaque connexion.')
    } else {
      outError('  Vérifie que le compte est autorisé à créer des tâches planifiées.')
    }
    process.exitCode = 1
    return
  }

  // 3. Vérification d'existence.
  const query = await runSchtasks(['/Query', '/TN', `${TASK_DIR}\\${TASK_NAME}`])
  if (query.code !== 0) {
    outError('✗ La tâche ne répond pas à l’interrogation — création incertaine.')
    if (query.output.length > 0) outError(`  ${query.output}`)
    process.exitCode = 1
    return
  }

  out('✓ Tâche « OSSO Companion » enregistrée et vérifiée.')
  out('  Elle démarrera automatiquement à ta prochaine connexion, sans fenêtre.')
  out('  Pour la retirer : schtasks /Delete /TN "\\OSSO\\OSSO Companion" /F')
}

main().catch((error: unknown) => {
  outError(`✗ Erreur : ${error instanceof Error ? error.message : String(error)}`)
  process.exitCode = 1
})
