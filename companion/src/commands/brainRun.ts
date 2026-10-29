/**
 * Commande `brain:run` — exécute la commande brain **prise dans la config
 * locale** (jamais dans le payload réseau), avec `cwd = dev_root`.
 *
 * Découpage en fichier + args (split espaces), `shell: false` strictement interdit.
 */

import { spawn } from 'node:child_process'
import { errorMessage, log, truncate, type CompanionConfig } from '../config.ts'

const RUN_TIMEOUT_MS = 120_000
const MAX_RESULT_CHARS = 400

/** Découpe une commande en [fichier, ...args] — simple split espaces. */
export function tokenize(command: string): string[] {
  return command.trim().split(/\s+/).filter((part) => part.length > 0)
}

/** Exécute la commande brain configurée et retourne un résultat court. */
export function runBrain(config: CompanionConfig): Promise<string> {
  const command = config.brain_command.trim()
  if (command.length === 0) {
    return Promise.reject(
      new Error('Commande brain non configurée — configure-la dans la config du Companion.'),
    )
  }

  const parts = tokenize(command)
  const file = parts[0]
  const args = parts.slice(1)
  if (file === undefined) {
    return Promise.reject(
      new Error('Commande brain non configurée — configure-la dans la config du Companion.'),
    )
  }

  return new Promise<string>((resolve, reject) => {
    let stdout = ''
    let stderr = ''
    let settled = false

    const fail = (message: string): void => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      reject(new Error(message))
    }
    const succeed = (message: string): void => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      resolve(message)
    }

    let child
    try {
      child = spawn(file, args, {
        cwd: config.dev_root,
        shell: false,
        windowsHide: true,
        stdio: ['ignore', 'pipe', 'pipe'],
      })
    } catch (error) {
      fail(`Lancement de la commande brain impossible : ${errorMessage(error)}`)
      return
    }

    const timer = setTimeout(() => {
      child.kill()
      fail(`Commande brain interrompue après ${RUN_TIMEOUT_MS / 1000} s.`)
    }, RUN_TIMEOUT_MS)

    child.stdout.setEncoding('utf8')
    child.stderr.setEncoding('utf8')
    child.stdout.on('data', (chunk: string) => {
      if (stdout.length < 10_000) stdout += chunk
    })
    child.stderr.on('data', (chunk: string) => {
      if (stderr.length < 10_000) stderr += chunk
    })
    child.on('error', (error) => {
      fail(`Exécution de la commande brain impossible : ${errorMessage(error)}`)
    })
    child.on('close', (code) => {
      const detail = truncate((stderr.length > 0 ? stderr : stdout).trim(), MAX_RESULT_CHARS)
      if (code === 0) {
        succeed(detail.length > 0 ? detail : 'Commande brain terminée (aucune sortie).')
      } else {
        fail(`Commande brain terminée avec le code ${String(code)}${detail.length > 0 ? ` : ${detail}` : '.'}`)
      }
    })

    log('INFO', `brain:run → ${file} ${args.join(' ')} (cwd : ${config.dev_root})`)
  })
}
