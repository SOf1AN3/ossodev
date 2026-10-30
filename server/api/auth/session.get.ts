/**
 * GET /api/auth/session — état de la session pour la page de connexion.
 *
 * Retourne toujours `{ data: { authenticated: boolean } }` en 200 : le jeton
 * absent/invalide/expiré n'est pas une erreur, c'est un état. Si
 * `DASHBOARD_PASSWORD` manque, c'est d'abord le middleware qui répond 501
 * (fail-closed avant toute exemption) ; la route appelle en plus
 * `requireSessionKey()` — même 501 via `runApi` — si elle était atteinte hors
 * middleware : garde-fou défensif, jamais une 200 mensongère.
 */
import { defineEventHandler } from 'h3'
import { runApi } from '~~/server/utils/http'
import { readSessionToken, requireSessionKey, verifySessionToken } from '~~/server/utils/session'

/** GET /api/auth/session → `{ data: { authenticated: boolean } }`. */
export default defineEventHandler((event) =>
  runApi(event, async () => ({
    authenticated: verifySessionToken(requireSessionKey(), readSessionToken(event)),
  })),
)
