/**
 * Point d'entrée du Companion OSSO.
 *
 * 1. Lit la config locale (exit propre et explicite si absente)
 * 2. Installe le tray
 * 3. Boucle : heartbeat → claim → exécution **séquentielle** (une commande à la
 *    fois) → complete, avec back-off en cas d'échec réseau.
 * 4. SIGINT/SIGTERM → nettoyage et arrêt propre.
 *
 * Aucune erreur réseau ne fait quitter le processus.
 */

import { spawn } from 'node:child_process'
import { claim, complete, heartbeat, logNetworkFailure, sendBrainResult, type CompanionCommand } from './api.ts'
import { buildScanPayload } from './commands/brainScan.ts'
import { runBrain } from './commands/brainRun.ts'
import { runLead } from './commands/lead.ts'
import { errorMessage, loadConfig, log, registerSecretRedaction, truncate, type CompanionConfig } from './config.ts'
import { assertAllowedKey, assertSafeAbsolutePath, verifySignature } from './security.ts'
import { startTray, type TrayHandle } from './tray.ts'

const BASE_INTERVAL_MS = 7_000
const MAX_INTERVAL_MS = 60_000
const FAILURES_BEFORE_BACKOFF = 3
const MAX_RESULT_CHARS = 500

interface RunnerState {
  executedCount: number
  lastSuccessAt: number | null
  consecutiveFailures: number
  intervalMs: number
  online: boolean
}

function formatStatus(state: RunnerState): string {
  const count = state.executedCount
  const plural = count > 1 ? 's' : ''
  const executed = `${String(count)} commande${plural} exécutée${plural}`
  const presence = state.online ? 'En ligne' : 'Hors ligne'
  if (state.lastSuccessAt === null) {
    return `${presence} · ${executed} · aucune réponse encore`
  }
  const agoSeconds = Math.max(0, Math.round((Date.now() - state.lastSuccessAt) / 1000))
  return `${presence} · ${executed} · dernière il y a ${String(agoSeconds)} s`
}

/**
 * Exécute une commande déjà réclamée.
 * Ordre imposé : liste blanche → signature → validation du chemin → exécution.
 */
async function executeCommand(
  config: CompanionConfig,
  command: CompanionCommand,
): Promise<{ status: 'done' | 'failed'; result: string }> {
  try {
    // 1. Liste blanche (constante locale, jamais étendue depuis la réponse réseau).
    assertAllowedKey(command.command_key)
    // 2. Signature HMAC + fraîcheur (120 s max, pas de comparaison d'horloge).
    verifySignature(command, config.secret)
    // 3. Validation du chemin (défense en profondeur, avant toute exécution).
    if (command.command_key === 'opencode:lead') {
      assertSafeAbsolutePath(command.payload.folder_path, config.dev_root)
    }

    switch (command.command_key) {
      case 'opencode:lead': {
        const result = await runLead(config, command.payload)
        return { status: 'done', result: truncate(result, MAX_RESULT_CHARS) }
      }
      case 'brain:scan': {
        const payload = await buildScanPayload(config)
        await sendBrainResult(config, payload)
        return {
          status: 'done',
          result: `Scan envoyé : ${String(payload.projects.length)} projet(s) détecté(s), ${String(payload.errors.length)} erreur(s).`,
        }
      }
      case 'brain:run': {
        const result = await runBrain(config)
        return { status: 'done', result: truncate(result, MAX_RESULT_CHARS) }
      }
      default: {
        // Jamais atteint (la liste blanche filtre avant), garde-fou défensif.
        return { status: 'failed', result: `Commande non prise en charge : ${command.command_key}` }
      }
    }
  } catch (error) {
    const reason = truncate(errorMessage(error), MAX_RESULT_CHARS)
    log('WARN', `Commande ${command.command_key} (${command.id}) refusée/échouée : ${reason}`)
    return { status: 'failed', result: reason }
  }
}

/** Un cycle complet : heartbeat → claim → exécution séquentielle → complete. */
async function pollOnce(config: CompanionConfig, state: RunnerState): Promise<void> {
  let networkOk = false

  try {
    await heartbeat(config)
    networkOk = true
  } catch (error) {
    state.online = false
    logNetworkFailure('heartbeat', error)
  }

  let commands: CompanionCommand[] = []
  try {
    commands = await claim(config)
    networkOk = true
  } catch (error) {
    state.online = false
    logNetworkFailure('claim', error)
  }

  // Exécution stricte : dans l'ordre reçu, une seule à la fois.
  for (const command of commands) {
    const outcome = await executeCommand(config, command)
    try {
      await complete(config, command.id, outcome.status, outcome.result)
    } catch (error) {
      logNetworkFailure(`complete(${command.id})`, error)
    }
    if (outcome.status === 'done') {
      state.executedCount += 1
    }
  }

  if (networkOk) {
    state.online = true
    state.lastSuccessAt = Date.now()
    state.consecutiveFailures = 0
    if (state.intervalMs !== config.poll_interval_ms) {
      state.intervalMs = config.poll_interval_ms
    }
  } else {
    state.online = false
    state.consecutiveFailures += 1
    if (state.consecutiveFailures >= FAILURES_BEFORE_BACKOFF) {
      state.consecutiveFailures = 0
      state.intervalMs = Math.min(state.intervalMs * 2, MAX_INTERVAL_MS)
      log('WARN', `Back-off : prochain cycle dans ${String(Math.round(state.intervalMs / 1000))} s.`)
    }
  }
}

/** Ouvre le dashboard dans le navigateur par défaut — jamais de shell interprété. */
function openDashboard(url: string): void {
  try {
    const child = spawn('cmd.exe', ['/c', 'start', '', url], {
      detached: true,
      stdio: 'ignore',
      windowsHide: false,
      windowsVerbatimArguments: true,
      shell: false,
    })
    child.on('error', (error) => {
      log('ERROR', `Ouverture du dashboard impossible : ${errorMessage(error)}`)
    })
    child.unref()
  } catch (error) {
    log('ERROR', `Ouverture du dashboard impossible : ${errorMessage(error)}`)
  }
}

function main(): void {
  // 1. Config — exit propre et explicite si absente.
  let config: CompanionConfig
  try {
    config = loadConfig()
  } catch (error) {
    const message = errorMessage(error)
    log('ERROR', message)
    process.stderr.write(`[OSSO Companion] ${message}\n`)
    process.exit(1)
    return
  }
  registerSecretRedaction(config.secret)
  log('INFO', `Companion démarré — API ${config.oss_url}, dev_root ${config.dev_root}, intervalle ${String(config.poll_interval_ms)} ms.`)

  const state: RunnerState = {
    executedCount: 0,
    lastSuccessAt: null,
    consecutiveFailures: 0,
    intervalMs: config.poll_interval_ms || BASE_INTERVAL_MS,
    online: false,
  }

  let stopped = false
  let cycleRunning = false
  let timer: ReturnType<typeof setInterval> | null = null
  let tray: TrayHandle | null = null

  const shutdown = (reason: string): void => {
    if (stopped) return
    stopped = true
    if (timer !== null) {
      clearInterval(timer)
      timer = null
    }
    if (tray !== null) {
      tray.dispose()
      tray = null
    }
    log('INFO', `Companion arrêté (${reason}).`)
  }

  // 2. Tray — un échec du tray ne bloque jamais la boucle.
  tray = startTray({
    onOpenDashboard: () => {
      openDashboard(config.oss_url)
    },
    onQuit: () => {
      shutdown('menu du tray')
    },
  })

  // 3. Boucle de polling — jamais deux cycles en parallèle, back-off inclus.
  const runCycle = async (): Promise<void> => {
    if (cycleRunning || stopped) return
    cycleRunning = true
    try {
      await pollOnce(config, state)
    } catch (error) {
      // Filet de sécurité : aucune erreur ne doit tuer le processus.
      log('ERROR', `Cycle inattendu en échec : ${errorMessage(error)}`)
    } finally {
      cycleRunning = false
      if (tray !== null) tray.updateStatus(formatStatus(state))
      if (stopped === false) {
        // Redémarre le timer si l'intervalle a changé (back-off ou retour au base).
        if (timer !== null) clearInterval(timer)
        timer = setInterval(() => {
          void runCycle()
        }, state.intervalMs)
      }
    }
  }

  timer = setInterval(() => {
    void runCycle()
  }, state.intervalMs)
  void runCycle()

  // 4. Arrêt propre.
  process.on('SIGINT', () => {
    shutdown('SIGINT')
    process.exit(0)
  })
  process.on('SIGTERM', () => {
    shutdown('SIGTERM')
    process.exit(0)
  })
}

main()
