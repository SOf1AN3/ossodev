/**
 * Authentification & signature des commandes Companion (PLAN.md §2 piste A · D8).
 *
 * - `COMPANION_SECRET` vit **uniquement** dans `.env` (jamais dans Supabase,
 *   jamais côté client, jamais dans un log). S'il manque, on renvoie un 500
 *   explicite en français plutôt qu'un crash muet.
 * - La comparaison du Bearer se fait en **temps constant** :
 *   chaque valeur est hachée en SHA-256 (longueur fixe de 32 octets) puis
 *   comparée via `crypto.timingSafeEqual` — aucune fuite de longueur ni de
 *   contenu par le chronomètre.
 * - `signCommand` produit le HMAC-SHA256 (hex) que le Companion vérifiera
 *   avant exécution. Base = `id|command_key|JSON.stringify(payload)|expires_at`.
 */
import { createHmac, createHash, timingSafeEqual } from 'node:crypto'
import { getHeader } from 'h3'
import type { H3Event } from 'h3'
import { apiError, forbidden } from '~~/server/utils/http'

const BEARER_PREFIX = 'Bearer '

/**
 * Secret Companion. 500 explicite si absent — jamais un crash muet.
 * (Lit `process.env` : `runtimeConfig` n'est pas fiable hors requête en dev.)
 */
export function requireCompanionSecret(): string {
  const secret = process.env.COMPANION_SECRET
  if (typeof secret !== 'string' || secret.trim().length === 0) {
    apiError(
      'COMPANION_SECRET_MANQUANT',
      'COMPANION_SECRET manquant — relance `node scripts/companion-init.mjs`.',
      500,
    )
  }
  return secret
}

/**
 * Comparaison à temps constant : hachage SHA-256 (taille fixe) puis
 * `timingSafeEqual`. Évite toute fuite de longueur et supporte des
 * entrées de longueurs différentes sans lever.
 */
function constantTimeEquals(a: string, b: string): boolean {
  const hashA = createHash('sha256').update(a, 'utf8').digest()
  const hashB = createHash('sha256').update(b, 'utf8').digest()
  return timingSafeEqual(hashA, hashB)
}

/**
 * Vérifie `Authorization: Bearer <COMPANION_SECRET>`.
 * 403 (`forbidden`) si le schéma, le jeton ou le secret sont absents/incorrects.
 */
export function requireCompanionAuth(event: H3Event): void {
  const expected = requireCompanionSecret()
  const header = getHeader(event, 'authorization')

  if (typeof header !== 'string' || !header.startsWith(BEARER_PREFIX)) {
    forbidden('Authentification Companion requise (en-tête Authorization: Bearer).')
  }

  const token = header.slice(BEARER_PREFIX.length).trim()
  if (token.length === 0 || !constantTimeEquals(token, expected)) {
    forbidden('Secret Companion invalide.')
  }
}

/** Objet minimal nécessaire à la signature d'une commande. */
export interface SignableCommand {
  id: string
  command_key: string
  payload: unknown
  /** ISO 8601 — doit correspondre exactement à la valeur stockée en base. */
  expires_at: string
}

/** HMAC-SHA256 (hex) sur `id|command_key|JSON.stringify(payload)|expires_at`. */
export function signCommand(command: SignableCommand): string {
  const base = `${command.id}|${command.command_key}|${JSON.stringify(command.payload)}|${command.expires_at}`
  return createHmac('sha256', requireCompanionSecret()).update(base, 'utf8').digest('hex')
}
