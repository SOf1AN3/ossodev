/**
 * POST /api/auth/login — connexion au dashboard par mot de passe.
 *
 * - Corps validé par Zod (`{ password: string }`) **avant** tout traitement.
 *   Contrairement aux autres routes (400 `VALIDATION` via `readValid`), un
 *   échec de validation ne renvoie pas 400 ici mais bien le 401 unique du
 *   contrat : un code/message différent révélerait si le champ `password`
 *   était absent/mal typé — c'est exactement l'oracle que le contrat interdit.
 * - Comparaison en **temps constant** (SHA-256 + `timingSafeEqual`, cf.
 *   `server/utils/session.ts`) — jamais de `===` sur le secret.
 * - **Message unique** quel que soit l'échec (mot de passe vide, absent ou
 *   faux) : aucun oracle pour un attaquant.
 * - **Throttling en mémoire** (constante de module) : après `MAX_FAILS`
 *   échecs consécutifs, pénalité progressive 1s → 2s → 4s → … plafonnée à 60s,
 *   levée dès une connexion réussie. En production serverless, la Map est par
 *   instance : c'est une défense en profondeur, pas une garantie distribuée
 *   (l'IP vient du header `x-forwarded-for` posé par Vercel).
 * - Succès → cookie `osso_session` signé (7 jours) + `{ data: { ok: true } }`.
 * - `DASHBOARD_PASSWORD` manquant → 501 fail-closed, comme partout ailleurs.
 */
import { defineEventHandler, getRequestIP, readBody } from 'h3'
import { z } from 'zod'
import { apiError, runApi } from '~~/server/utils/http'
import {
  createSessionToken,
  passwordMatches,
  requireDashboardPassword,
  sessionKeyFromPassword,
  setSessionCookie,
} from '~~/server/utils/session'

/** Schéma d'entrée : corps JSON `{ password: string }`. */
const loginSchema = z.object({
  password: z.string(),
})

/** Échec unique — mot de passe vide, absent ou faux : même réponse, aucun oracle. */
const LOGIN_FAILED_MESSAGE = 'Mot de passe incorrect.'

/** Message du throttling (code 429). */
const RATE_LIMITED_MESSAGE =
  'Trop de tentatives de connexion : réessaie dans quelques secondes.'

/** État de throttling par IP. */
interface ThrottleEntry {
  /** Échecs consécutifs (remis à zéro par une connexion réussie). */
  fails: number
  /** Date (ms) à partir de laquelle de nouvelles tentatives sont acceptées. */
  lockedUntil: number
}

/**
 * Registre en mémoire des tentatives échouées, par IP. Constante de module :
 * elle survit aux requêtes d'un même process (un lambda Vercel chaud), ce qui
 * est le but. Clé = IP retournée par `getRequestIP(xForwardedFor: true)`.
 */
const throttle = new Map<string, ThrottleEntry>()

/** Seuil au-delà duquel la pénalité progressive démarre (5 échecs consécutifs). */
const MAX_FAILS = 5

/** Première pénalité (1s), doublée à chaque échec supplémentaire. */
const BASE_PENALTY_MS = 1_000

/** Plafond de pénalité : 60 secondes. */
const MAX_PENALTY_MS = 60_000

/**
 * Enregistre un échec pour `ip` et applique la pénalité progressive
 * 1s → 2s → 4s → … plafonnée à `MAX_PENALTY_MS`, à partir de `MAX_FAILS`
 * échecs consécutifs. Un échec en dessous du seuil ne verrouille pas.
 * L'entrée est relue ici (et non capturée avant `await readBody`) : le
 * lecture-écriture est synchrone dans ce bloc, ce qui évite de sous-compter
 * deux échecs concurrents sur la même IP.
 */
function registerFailure(ip: string, now: number): void {
  const entry = throttle.get(ip)
  const fails = (entry?.fails ?? 0) + 1
  const overThreshold = fails - MAX_FAILS
  const penaltyMs =
    overThreshold < 0 ? 0 : Math.min(BASE_PENALTY_MS * 2 ** overThreshold, MAX_PENALTY_MS)
  throttle.set(ip, { fails, lockedUntil: penaltyMs > 0 ? now + penaltyMs : 0 })
}

/** POST /api/auth/login — `{ password }` → cookie de session signé. */
export default defineEventHandler((event) =>
  runApi(event, async () => {
    // 1. Fail-closed : le mot de passe doit être configuré (501 sinon), et on
    //    en dérive la clé de signature du jeton de session.
    const expected = requireDashboardPassword()
    const sessionKey = sessionKeyFromPassword(expected)

    // 2. IP du client (Vercel fournit x-forwarded-for) pour le throttling.
    const ip = getRequestIP(event, { xForwardedFor: true }) ?? 'inconnue'
    const now = Date.now()

    // 3. Pénalité active → 429, avant même de lire le corps.
    const active = throttle.get(ip)
    if (active && active.lockedUntil > now) {
      apiError('RATE_LIMITED', RATE_LIMITED_MESSAGE, 429)
    }

    // 4. Corps validé par Zod. Échec de validation = même 401 unique que les
    //    autres échecs (pas de 400 `VALIDATION` ici) : sinon un code différent
    //    révélerait que le champ est absent ou mal typé — oracle interdit.
    const body = await readBody(event).catch(() => undefined)
    const parsed = loginSchema.safeParse(body)
    if (!parsed.success) {
      // Un corps invalide compte comme une tentative : sinon on pourrait
      // distinguer « corps absent » d'« identifiants faux ».
      registerFailure(ip, now)
      apiError('UNAUTHORIZED', LOGIN_FAILED_MESSAGE, 401)
    }

    // 5. Comparaison à temps constant — jamais de `===` sur le secret.
    if (!passwordMatches(parsed.data.password, expected)) {
      registerFailure(ip, now)
      apiError('UNAUTHORIZED', LOGIN_FAILED_MESSAGE, 401)
    }

    // 6. Connexion réussie : pénalité levée, jeton signé, cookie httpOnly.
    throttle.delete(ip)
    setSessionCookie(event, createSessionToken(sessionKey))
    return { ok: true } as const
  }),
)
