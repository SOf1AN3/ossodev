/**
 * Route catch-all Nitro sous `/api`.
 *
 * Ne sert que si **aucune** route explicite ne matche (priorité native des
 * routes nommées sur `[...]` : `GET /api/tasks` reste servi par sa route).
 * Répond 404 dans l'enveloppe standard `{ error: { code, message } }`,
 * avec méthode HTTP et chemin dans le message (debuggable), sans stack
 * trace ni chemin de fichier.
 */
import { defineEventHandler, getMethod } from 'h3'
import { apiError, runApi } from '~~/server/utils/http'

export default defineEventHandler((event) =>
  runApi(event, async () => {
    const method = getMethod(event)
    const path = event.path.split('?')[0] ?? event.path
    apiError('NOT_FOUND', `Route API inconnue : ${method} ${path}`, 404)
  }),
)
