/**
 * Commande `opencode:lead` :
 * valider le chemin → écrire `prompt.md` → copier le prompt (best effort)
 * → ouvrir le terminal dans le dossier du projet.
 */

import { spawn } from 'node:child_process'
import fs from 'node:fs/promises'
import path from 'node:path'
import type { CompanionCommandPayload } from '../api.ts'
import { errorMessage, log, type CompanionConfig } from '../config.ts'
import { assertSafeAbsolutePath } from '../security.ts'

/** Gabarit par défaut (identique au pont local). */
const DEFAULT_TERMINAL_COMMAND = 'cmd /k cd /d "{{DOSSIER}}" && opencode'

const PROMPT_MAX_BYTES = 500_000

/**
 * Ouvre un terminal dans le dossier du projet.
 *
 * `shell: false` partout : la ligne est construite puis passée telle quelle à
 * `cmd.exe` avec `windowsVerbatimArguments` — aucune interprétation par un shell
 * intermédiaire. Le chemin est déjà validé par l'allowlist (aucun métacaractère
 * ne peut y figurer), donc l'injection est structurellement impossible.
 */
function openTerminal(folderPath: string, config: CompanionConfig): void {
  const template = config.terminal_command.trim().length > 0
    ? config.terminal_command
    : DEFAULT_TERMINAL_COMMAND

  const substituted = template.split('{{DOSSIER}}').join(`"${folderPath}"`)

  // Forme standard `cmd /k …` : on isole le corps puis on lance
  // `start "" cmd /k "<corps>"` — le corps entre guillemets pour que `&&` soit
  // interprété par le cmd /k fils, pas par le shell parent.
  // Forme personnalisée : ligne passée telle quelle à `cmd /c`.
  const head = /^cmd\s+\/k\s+/i.exec(substituted)
  const inner = head === null ? substituted : substituted.slice(head[0].length)
  const argv: string[] = head === null
    ? ['/c', substituted]
    : ['/c', 'start', '', 'cmd', '/k', `"${inner}"`]

  try {
    const child = spawn('cmd.exe', argv, {
      detached: true,
      stdio: 'ignore',
      windowsHide: false,
      windowsVerbatimArguments: true,
      shell: false,
    })
    child.on('error', (error) => {
      log('ERROR', `Échec du lancement du terminal : ${errorMessage(error)}`)
    })
    child.unref()
  } catch (error) {
    throw new Error(`Impossible d'ouvrir le terminal : ${errorMessage(error)}`)
  }

  log('INFO', `Terminal demandé dans ${folderPath} (corps : ${inner})`)
}

/**
 * Exécute une commande `opencode:lead`.
 * Retourne un résultat court à renvoyer au serveur (jamais le prompt complet).
 */
export async function runLead(
  config: CompanionConfig,
  payload: CompanionCommandPayload,
): Promise<string> {
  const folderPath = assertSafeAbsolutePath(payload.folder_path, config.dev_root)

  const prompt = payload.prompt
  if (typeof prompt !== 'string' || prompt.trim().length === 0) {
    throw new Error('Prompt vide : la commande LEAD est refusée.')
  }
  if (prompt.length > PROMPT_MAX_BYTES) {
    throw new Error('Prompt trop volumineux (limite 500 000 caractères).')
  }

  // 1. Écriture de prompt.md dans le dossier du projet (dans dev_root, validé).
  const promptFile = path.join(folderPath, 'prompt.md')
  try {
    await fs.writeFile(promptFile, prompt, 'utf8')
  } catch (error) {
    throw new Error(`Écriture de prompt.md impossible : ${errorMessage(error)}`)
  }

  // 2. Copie dans le presse-papier — best effort, échec ignoré.
  try {
    const clip = spawn('clip.exe', [], { shell: false, windowsHide: true })
    clip.on('error', (error) => {
      log('WARN', `Copie presse-papier indisponible : ${errorMessage(error)}`)
    })
    clip.stdin.on('error', () => {
      // Échec du presse-papier : non bloquant.
    })
    clip.stdin.end(prompt, 'utf8')
    clip.unref()
  } catch {
    // Best effort : on continue même sans presse-papier.
  }

  // 3. Ouverture du terminal.
  openTerminal(folderPath, config)

  log('INFO', `LEAD exécuté dans ${folderPath} (prompt : ${prompt.length} caractères).`)
  return `Terminal ouvert dans ${folderPath} · prompt.md écrit (${prompt.length} caractères).`
}
