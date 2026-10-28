/**
 * Infrastructure HTTP partagée — enveloppe de réponse unique de l'API OSSO.
 *
 * Succès → { data: T }
 * Échec  → { error: { code, message } }  + code HTTP explicite
 *
 * Toutes les routes doivent passer par `runApi`. Ne jamais réimplémenter.
 */
import { getQuery, getRouterParams, readBody, setResponseStatus } from 'h3'
import type { H3Event } from 'h3'
import { z } from 'zod'

export interface ApiFailure {
  error: { code: string; message: string }
}

/** Enveloppe de succès. */
export function ok<T>(data: T): { data: T } {
  return { data }
}

/** Lance une erreur normalisée (attrapée ensuite par `runApi`). */
export function apiError(code: string, message: string, status = 400): never {
  const err = new Error(message) as Error & {
    statusCode?: number
    data?: { error: { code: string; message: string } }
  }
  err.statusCode = status
  err.data = { error: { code, message } }
  throw err
}

export function notFound(ressource: string): never {
  apiError('NOT_FOUND', `${ressource} introuvable.`, 404)
}

export function badRequest(message: string, code = 'BAD_REQUEST'): never {
  apiError(code, message, 400)
}

export function forbidden(message: string): never {
  apiError('FORBIDDEN', message, 403)
}

/**
 * Wrapper unique de toutes les routes. Sérialise l'enveloppe et mappe
 * toute exception vers `{ error }` sans jamais fuiter de stack trace.
 */
export async function runApi<T>(
  event: H3Event,
  handler: () => Promise<T>,
): Promise<{ data: T } | ApiFailure> {
  try {
    return ok(await handler())
  } catch (e: unknown) {
    const err = e as {
      statusCode?: number
      statusMessage?: string
      message?: string
      data?: { error?: { code: string; message: string } }
    }

    const shaped =
      err?.data?.error ?? {
        code: 'INTERNAL',
        message: err?.statusMessage || err?.message || 'Erreur interne du serveur.',
      }

    setResponseStatus(event, err?.statusCode ?? 500)
    return { error: shaped }
  }
}

/** Corps de requête validé par un schéma Zod → erreur 400 normalisée. */
export async function readValid<T>(schema: z.ZodType<T>, event: H3Event): Promise<T> {
  let raw: unknown
  try {
    raw = await readBody(event)
  } catch {
    badRequest('Corps de requête absent ou invalide.')
  }

  const parsed = schema.safeParse(raw)
  if (!parsed.success) {
    const first = parsed.error.issues[0]
    const field = first.path.join('.') || 'corps'
    badRequest(`${field} : ${first.message}`, 'VALIDATION')
  }
  return parsed.data
}

/** Paramètre d'URL obligatoire. */
export function requiredParam(event: H3Event, name: string): string {
  const value = getRouterParams(event)[name]
  if (!value) badRequest(`Paramètre « ${name} » manquant.`)
  return value
}

/** Paramètre de requête facultatif, trimé. */
export function optionalQuery(event: H3Event, name: string): string | undefined {
  const value = getQuery(event)[name]
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : undefined
}

/** Schéma Zod réutilisable : UUID. */
export const uuidSchema = z.string().uuid('Identifiant invalide.')
