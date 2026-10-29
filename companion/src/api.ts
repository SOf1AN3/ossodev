/**
 * Client HTTP de l'API OSSO — fetch natif de Node 24, zéro dépendance.
 *
 * Gestion d'erreur stricte : toute erreur réseau est loguée et propagée à la
 * boucle, qui la traite (back-off) sans jamais planter le processus.
 */

import { errorMessage, log, type CompanionConfig } from './config.ts'

export interface CompanionCommandPayload {
  folder_path?: string
  prompt?: string
  dev_root?: string
}

export interface CompanionCommand {
  id: string
  command_key: string
  payload: CompanionCommandPayload
  created_at: string
  expires_at: string
  signature: string
}

export interface BrainProject {
  name: string
  folder_path: string
}

export interface BrainScanPayload {
  dev_root: string
  projects: BrainProject[]
  errors: string[]
}

export interface CompleteResult {
  id: string
  status: 'done' | 'failed'
}

const REQUEST_TIMEOUT_MS = 10_000

class ApiError extends Error {}

async function postJson<T>(
  config: CompanionConfig,
  route: string,
  body: unknown,
): Promise<T> {
  const url = `${config.oss_url}${route}`
  let response: Response
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.secret}`,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    })
  } catch (error) {
    throw new ApiError(`réseau indisponible pour ${route} : ${errorMessage(error)}`)
  }

  if (response.ok === false) {
    throw new ApiError(`réponse ${response.status} pour ${route}`)
  }

  try {
    return (await response.json()) as T
  } catch (error) {
    throw new ApiError(`réponse illisible pour ${route} : ${errorMessage(error)}`)
  }
}

function unwrapData<T>(payload: unknown, route: string): T {
  if (typeof payload !== 'object' || payload === null) {
    throw new ApiError(`réponse inattendue pour ${route}`)
  }
  const data = (payload as { data?: unknown }).data
  if (data === undefined) {
    throw new ApiError(`champ data manquant pour ${route}`)
  }
  return data as T
}

/** Signale au serveur que le Companion est en vie. */
export async function heartbeat(config: CompanionConfig): Promise<void> {
  await postJson<unknown>(config, '/api/companion/heartbeat', {})
}

/** Réclame les commandes en attente (le serveur les passe atomiquement en `claimed`). */
export async function claim(config: CompanionConfig): Promise<CompanionCommand[]> {
  const raw = await postJson<unknown>(config, '/api/companion/commands/claim', {})
  const data = unwrapData<{ commands?: unknown }>(raw, 'claim')
  const commands = data.commands
  if (Array.isArray(commands) === false) {
    throw new ApiError('champ commands absent de la réponse claim')
  }
  return commands.filter(isCompanionCommand)
}

function isCompanionCommand(value: unknown): value is CompanionCommand {
  if (typeof value !== 'object' || value === null) return false
  const record = value as Record<string, unknown>
  return (
    typeof record.id === 'string' &&
    typeof record.command_key === 'string' &&
    typeof record.created_at === 'string' &&
    typeof record.expires_at === 'string' &&
    typeof record.signature === 'string' &&
    typeof record.payload === 'object' &&
    record.payload !== null
  )
}

/** Retourne l'issue d'une commande au serveur. */
export async function complete(
  config: CompanionConfig,
  id: string,
  status: 'done' | 'failed',
  resultText?: string,
): Promise<void> {
  const body: { status: 'done' | 'failed'; result_text?: string } = { status }
  if (resultText !== undefined) body.result_text = resultText
  const raw = await postJson<unknown>(config, `/api/companion/commands/${encodeURIComponent(id)}/complete`, body)
  unwrapData<unknown>(raw, 'complete')
}

/** Envoie le résultat du scan brain (le serveur fait l'upsert). */
export async function sendBrainResult(config: CompanionConfig, payload: BrainScanPayload): Promise<void> {
  const raw = await postJson<unknown>(config, '/api/companion/brain-result', payload)
  unwrapData<unknown>(raw, 'brain-result')
}

/** Log local utilitaire réutilisé par la boucle pour les échecs réseau. */
export function logNetworkFailure(context: string, error: unknown): void {
  log('WARN', `${context} : ${errorMessage(error)}`)
}
