/**
 * POST /api/auth/logout — suppression du cookie de session.
 *
 * Jeton sans état : il n'y a rien à invalider côté serveur. On efface le
 * cookie `osso_session` (même `path` que l'écriture, cf.
 * `server/utils/session.ts`) ; le jeton restant, s'il circule encore, expirera
 * de lui-même au bout de 7 jours ou deviendra invalide au prochain changement
 * de `DASHBOARD_PASSWORD`.
 */
import { defineEventHandler } from 'h3'
import { runApi } from '~~/server/utils/http'
import { clearSessionCookie } from '~~/server/utils/session'

/** POST /api/auth/logout → `{ data: { ok: true } }` (idempotent). */
export default defineEventHandler((event) =>
  runApi(event, async () => {
    clearSessionCookie(event)
    return { ok: true } as const
  }),
)
