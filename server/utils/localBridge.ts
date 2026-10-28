/**
 * Pont local OSSO — exécution de processus, écritures disque et presse-papier.
 *
 * Piliers de sécurité (ne jamais les affaiblir) :
 * 1. `SAFE_PATH_PATTERN` est une **allowlist** de caractères. Elle exclut tout
 *    métacaractère cmd.exe : `"` `'` `` ` `` `&` `|` `<` `>` `^` `%` `!` `$`
 *    `;` `(` `)` `~` `*` `?` `{` `}` `[]` `:` (après le disque) `\n` `\r` `\0`.
 * 2. Tout chemin est résolu (`path.resolve`) puis contraint à l'intérieur de
 *    `devRootPath` (jamais `path.normalize` seul).
 * 3. `spawn(..., { shell: false })` partout : aucune chaîne n'est interprétée
 *    par cmd.exe. Seule exception assumée : `openTerminalIn`, où la seule
 *    valeur injectée passe par l'allowlist et reste entre doubles guillemets
 *    (double protection), et où `windowsVerbatimArguments` évite toute
 *    ré-échappement ambigüe par Node.
 *
 * La politique (« le pont est-il ouvert ? ») vit dans les routes via
 * `assertBridgeAllowed()` ; ces fonctions ne sont que le mécanisme.
 */
import { spawn } from 'node:child_process'
import type { ChildProcess, ChildProcessWithoutNullStreams } from 'node:child_process'
import { existsSync } from 'node:fs'
import { writeFile } from 'node:fs/promises'
import path from 'node:path'
import type { BridgeStatus } from '~~/shared/types'
import { badRequest, forbidden } from '~~/server/utils/http'

/** Allowlist stricte : lettre de disque, `:`, puis uniquement caractères inoffensifs. */
export const SAFE_PATH_PATTERN = /^[A-Za-z]:[A-Za-z0-9 _.\-\\\/]+$/

const PROCESS_TIMEOUT_MS = 30_000
const CLIP_TIMEOUT_MS = 10_000
const MAX_OUTPUT_CHARS = 8_000
const MAX_PROMPT_CHARS = 200_000

interface BridgeConfig {
  localBridge: string
  devRootPath: string
  brainCommand: string
  terminalCommand: string
}

function bridgeConfig(): BridgeConfig {
  const config = useRuntimeConfig()
  // `.env` n'est pas toujours répercuté sur `runtimeConfig` en `nuxt dev`
  // (les requêtes DB passent parce que `db/index.ts` lit `process.env` directement).
  // On lit donc `process.env` en priorité : comportement identique en local et sur Vercel.
  const fromEnv = (key: string, fallback: string): string => {
    const value = process.env[key]
    return typeof value === 'string' && value.length > 0 ? value : fallback
  }

  return {
    localBridge: fromEnv(
      'NUXT_LOCAL_BRIDGE',
      typeof config.localBridge === 'string' ? config.localBridge : '',
    ),
    devRootPath: fromEnv(
      'NUXT_DEV_ROOT_PATH',
      typeof config.devRootPath === 'string' ? config.devRootPath : '',
    ),
    brainCommand: fromEnv(
      'NUXT_BRAIN_COMMAND',
      typeof config.brainCommand === 'string' ? config.brainCommand : '',
    ),
    terminalCommand: fromEnv(
      'NUXT_TERMINAL_COMMAND',
      typeof config.terminalCommand === 'string' ? config.terminalCommand : '',
    ),
  }
}

/** Statut public du pont — aucun processus lancé. */
export function isBridgeAvailable(): BridgeStatus {
  const { localBridge, devRootPath } = bridgeConfig()
  const root = devRootPath.trim().length > 0 ? devRootPath : null

  if (localBridge !== 'true') {
    return {
      available: false,
      reason: 'Pont local désactivé — fonctionnalité disponible uniquement en local',
      devRootPath: root,
    }
  }
  if (root === null) {
    return {
      available: false,
      reason: 'Racine du dossier dev non configurée (variable NUXT_DEV_ROOT_PATH).',
      devRootPath: null,
    }
  }
  if (!existsSync(root)) {
    return {
      available: false,
      reason: `Le dossier dev est introuvable : ${root}`,
      devRootPath: root,
    }
  }
  return { available: true, reason: null, devRootPath: root }
}

/** Lève un 403 si le pont est fermé. À appeler en tête de toute route exécutrice. */
export function assertBridgeAllowed(): void {
  const status = isBridgeAvailable()
  if (!status.available) forbidden(status.reason ?? 'Pont local indisponible.')
}

/**
 * Valide un chemin absolu de dossier avant toute écriture ou tout process :
 * allowlist de caractères + résolution + confinement strict sous `devRootPath`.
 */
export function assertSafeAbsolutePath(candidate: string): string {
  if (typeof candidate !== 'string') {
    badRequest('Chemin de dossier refusé : valeur non textuelle.')
  }
  if (candidate.length < 5 || candidate.length > 400) {
    badRequest('Chemin de dossier refusé : longueur invalide (5 à 400 caractères).')
  }
  // Vérifiée AVANT le pattern : jamais de caractère de contrôle dans un chemin.
  if (candidate.includes('\0') || candidate.includes('\n') || candidate.includes('\r')) {
    badRequest('Chemin de dossier refusé : caractère de contrôle détecté.')
  }
  if (!SAFE_PATH_PATTERN.test(candidate)) {
    badRequest(
      'Chemin de dossier refusé : caractères non autorisés. Renommez le dossier sans parenthèses, astérisques ni symboles spéciaux.',
    )
  }

  const resolved = path.resolve(candidate)
  if (!SAFE_PATH_PATTERN.test(resolved)) {
    badRequest('Chemin de dossier refusé : caractères non autorisés après résolution.')
  }

  const { devRootPath } = bridgeConfig()
  if (devRootPath.trim().length === 0) {
    badRequest('Racine du dossier dev non configurée (variable NUXT_DEV_ROOT_PATH).')
  }
  const root = path.resolve(devRootPath)
  if (resolved !== root && !resolved.startsWith(root + path.sep)) {
    badRequest('Le chemin doit se trouver à l’intérieur du dossier dev.')
  }
  return resolved
}

export interface ProcessResult {
  code: number | null
  stdout: string
  stderr: string
}

export interface RunProcessOptions {
  cwd?: string
}

/**
 * Exécute un binaire avec ses arguments sous forme de tableau.
 * `shell: false` impératif : aucun argument n'est interprété par cmd.exe et
 * aucune valeur utilisateur n'est concaténée dans `command`.
 */
export function runProcess(
  command: string,
  args: string[],
  options: RunProcessOptions = {},
): Promise<ProcessResult> {
  return new Promise<ProcessResult>((resolve, reject) => {
    let child: ChildProcessWithoutNullStreams
    try {
      child = spawn(command, args, {
        cwd: options.cwd,
        windowsHide: true,
        shell: false,
        timeout: PROCESS_TIMEOUT_MS,
      })
    } catch {
      reject(new Error(`Impossible de lancer « ${command} ».`))
      return
    }

    let stdout = ''
    let stderr = ''
    let timedOut = false
    let settled = false
    const startedAt = Date.now()

    const killTimer = setTimeout(() => {
      timedOut = true
      try {
        child.kill()
      } catch {
        // Process déjà terminé.
      }
    }, PROCESS_TIMEOUT_MS)

    child.stdout.on('data', (chunk: Buffer) => {
      if (stdout.length < MAX_OUTPUT_CHARS) {
        stdout = (stdout + chunk.toString('utf8')).slice(0, MAX_OUTPUT_CHARS)
      }
    })
    child.stderr.on('data', (chunk: Buffer) => {
      if (stderr.length < MAX_OUTPUT_CHARS) {
        stderr = (stderr + chunk.toString('utf8')).slice(0, MAX_OUTPUT_CHARS)
      }
    })

    child.on('error', (error: NodeJS.ErrnoException) => {
      if (settled) return
      settled = true
      clearTimeout(killTimer)
      reject(new Error(`Échec du lancement de « ${command} » (${error.code ?? 'erreur inconnue'}).`))
    })

    child.on('close', (code: number | null, _signal: NodeJS.Signals | null) => {
      if (settled) return
      settled = true
      clearTimeout(killTimer)
      if (timedOut || Date.now() - startedAt >= PROCESS_TIMEOUT_MS) {
        reject(new Error('Exécution interrompue : délai maximum de 30 secondes dépassé.'))
        return
      }
      resolve({ code, stdout, stderr })
    })
  })
}

/**
 * Copie du texte dans le presse-papier Windows (`clip.exe`).
 * Best effort : retourne `true`/`false`, ne lève jamais.
 */
export function copyToClipboard(text: string): Promise<boolean> {
  return new Promise<boolean>((resolve) => {
    let child: ChildProcessWithoutNullStreams
    try {
      child = spawn('clip.exe', [], { windowsHide: true, shell: false })
    } catch {
      resolve(false)
      return
    }

    let settled = false
    const guard = setTimeout(() => finish(false), CLIP_TIMEOUT_MS)
    function finish(value: boolean): void {
      if (settled) return
      settled = true
      clearTimeout(guard)
      resolve(value)
    }

    child.once('error', () => finish(false))
    // EPIPE possible si clip.exe se termine avant l'écriture.
    child.stdin.once('error', () => finish(false))
    child.once('close', (code: number | null) => finish(code === 0))
    child.stdin.end(text, 'utf8')
  })
}

/**
 * Écrit `prompt.md` dans un dossier déjà validé par l'allowlist.
 * Retourne le chemin du fichier écrit.
 */
export async function writePromptFile(folderPath: string, content: string): Promise<string> {
  const folder = assertSafeAbsolutePath(folderPath)
  if (content.length > MAX_PROMPT_CHARS) {
    badRequest('Contenu du prompt trop volumineux (200 000 caractères maximum).')
  }
  const filePath = path.join(folder, 'prompt.md')
  try {
    await writeFile(filePath, content, { encoding: 'utf8' })
  } catch {
    badRequest(`Écriture du fichier impossible dans : ${folder}`)
  }
  return filePath
}

export interface TerminalLaunch {
  launched: boolean
  command: string
}

/** Gabarit par défaut — affiché à l'utilisateur pour information. */
const DEFAULT_TERMINAL_COMMAND = 'cmd /k cd /d "{{DOSSIER}}" && opencode'

/**
 * Ouvre un terminal dans le dossier du projet et y lance `opencode`.
 * Double protection : le chemin passe l'allowlist ET reste entre doubles
 * guillemets dans la ligne de commande. Best effort côté lancement.
 */
export async function openTerminalIn(folderPath: string): Promise<TerminalLaunch> {
  const resolved = assertSafeAbsolutePath(folderPath)
  const quoted = `"${resolved}"`
  const custom = bridgeConfig().terminalCommand.trim()

  // Commande affichée à l'utilisateur (informatif).
  const command = custom.length > 0
    ? custom.split('{{DOSSIER}}').join(quoted)
    : DEFAULT_TERMINAL_COMMAND.split('{{DOSSIER}}').join(quoted)

  // Ligne réellement exécutée. `windowsVerbatimArguments` : Node ne ré-échappe
  // rien, la ligne est telle que nous la construisons — seule l'allowlist
  // protège l'injection, et elle est sans échappatoire.
  const line = custom.length > 0
    ? command
    : `start "" cmd /k "cd /d ${quoted} && opencode"`

  return await new Promise<TerminalLaunch>((resolve) => {
    let child: ChildProcess
    try {
      child = spawn('cmd.exe', ['/c', line], {
        detached: true,
        stdio: 'ignore',
        windowsHide: false,
        windowsVerbatimArguments: true,
        shell: false,
      })
    } catch {
      resolve({ launched: false, command })
      return
    }

    let settled = false
    child.once('spawn', () => {
      if (settled) return
      settled = true
      resolve({ launched: true, command })
    })
    child.once('error', () => {
      if (settled) return
      settled = true
      resolve({ launched: false, command })
    })
    child.unref()
  })
}
