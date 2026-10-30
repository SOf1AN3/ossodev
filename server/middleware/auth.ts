/**
 * Garde d'authentification du dashboard OSSO — session par cookie signé.
 *
 * Elle remplace l'ancien Basic Auth (popup navigateur) :
 *
 * - `DASHBOARD_PASSWORD` vit **uniquement** dans `.env` (jamais dans Supabase,
 *   jamais côté client, jamais dans un log). S'il est absent ou vide, on
 *   n'autorise **rien** (fail-closed) : un 501 explicite en français plutôt
 *   qu'un site laissé ouvert par défaut ou un crash muet. Ce contrôle est
 *   fait **avant toute exemption**, donc `/connexion` et l'API d'auth comprise.
 * - Exemptions strictes : `/connexion` (la page de connexion doit être
 *   accessible sans session), les routes `/api/auth/*` (qui gèrent
 *   elles-mêmes la session) et le préfixe `/api/companion/` (s'authentifie
 *   déjà via un Bearer HMAC, `server/utils/companionAuth.ts`).
 * - Session absente/invalide : **401 JSON** avec l'enveloppe
 *   `{ error: { code, message } }` de `server/utils/http.ts` pour tout ce qui
 *   commence par `/api/`, sinon **302** vers `/connexion` pour la navigation
 *   HTML — une 401 JSON sur une page serait illisible.
 * - Pas d'en-tête `WWW-Authenticate` : on ne veut plus de popup.
 *
 * Pourquoi on **retourne** l'enveloppe d'échec au lieu de `throw apiError(…)`,
 * dont la forme vient pourtant de `server/utils/http.ts` : un middleware Nitro
 * s'exécute **avant** `runApi`, qui ne verrait donc jamais cette erreur — elle
 * serait reprise par le gestionnaire d'erreurs de Nitro, qui répond
 * `{ error: true, url, statusCode, statusMessage, message, data }` :
 * incohérent avec l'enveloppe `{ error: { code, message } }` de l'API. En
 * retournant une valeur, h3 arrête la chaîne (aucune route ni page suivante
 * n'est exécutée) et sérialise directement notre enveloppe en JSON.
 */
import { defineEventHandler, sendRedirect, setResponseStatus } from 'h3'
import type { H3Event } from 'h3'
import type { ApiFailure } from '~~/server/utils/http'
import {
  PASSWORD_MISSING_CODE,
  PASSWORD_MISSING_MESSAGE,
  readDashboardPassword,
  readSessionToken,
  sessionKeyFromPassword,
  verifySessionToken,
} from '~~/server/utils/session'

/** Page de connexion : exemptée de session (c'est LE middleware qui redirige
 *  vers elle, jamais l'inverse). */
const LOGIN_PATH = '/connexion'

/** Routes API gérant elles-mêmes la session (login/logout/status). */
const AUTH_API_PATHS = new Set<string>([
  '/api/auth/login',
  '/api/auth/logout',
  '/api/auth/session',
])

/** Routes Companion : déjà protégées par Bearer HMAC, on leur laisse la main. */
const COMPANION_PREFIX = '/api/companion/'

/** Préfixe au-delà duquel un refus doit être du JSON, pas une redirection. */
const API_PREFIX = '/api/'

/**
 * Chemin normalisé pour les comparaisons : query string retirée et barres
 * doubles aplaties. `event.path` contient encore la query string, et h3 a déjà
 * décodé les `%XX` du chemin avant d'atteindre les middlewares (le décodage est
 * donc fait par h3, pas par nous — pas de double décodage à gérer ici).
 */
function normalizePath(rawPath: string): string {
  const queryIndex = rawPath.indexOf('?')
  const pathname = queryIndex === -1 ? rawPath : rawPath.slice(0, queryIndex)
  const collapsed = pathname.replace(/\/{2,}/g, '/')
  return collapsed.length === 0 ? '/' : collapsed
}

/** 401 + enveloppe normalisée (retournée au middleware, qui arrête la chaîne). */
function unauthorized(): ApiFailure {
  return {
    error: {
      code: 'UNAUTHORIZED',
      message: 'Session invalide ou absente : connexion requise.',
    },
  }
}

/**
 * Middleware global : protège **toutes** les routes et **toutes** les pages,
 * sauf `/connexion`, `/api/auth/*` et `/api/companion/`.
 * Retour `undefined` = autorisé : la requête continue vers la route ou la page.
 */
export default defineEventHandler(async (event: H3Event): Promise<ApiFailure | undefined> => {
  // 1. Fail-closed : sans mot de passe configuré, rien ne passe — ni les pages,
  //    ni l'API, ni même les routes d'authentification. On refuse avant toute
  //    autre lecture et avant toute exemption.
  const password = readDashboardPassword()
  if (password === undefined) {
    setResponseStatus(event, 501)
    return {
      error: { code: PASSWORD_MISSING_CODE, message: PASSWORD_MISSING_MESSAGE },
    }
  }

  const path = normalizePath(event.path)

  // 2. Chemins exemptés : page de connexion, routes d'auth, routes Companion.
  //    `/connexion` doit être exemptée AVANT le test de session, sans quoi une
  //    session absente produirait un 302 vers `/connexion`… lui-même refusé :
  //    boucle de redirection infinie et page de login inatteignable.
  if (path === LOGIN_PATH || AUTH_API_PATHS.has(path) || path.startsWith(COMPANION_PREFIX)) {
    return undefined
  }

  // 3. Session valide (jeton signé + non expiré) : on passe la main.
  if (verifySessionToken(sessionKeyFromPassword(password), readSessionToken(event))) {
    return undefined
  }

  // 4. Session absente/invalide : JSON 401 pour l'API, redirection pour le HTML.
  if (path.startsWith(API_PREFIX)) {
    setResponseStatus(event, 401)
    return unauthorized()
  }

  // Navigation HTML : une 401 JSON serait illisible, on renvoie vers /connexion.
  // `sendRedirect` termine la réponse (302 + meta refresh) ; le `await` garantit
  // que `event.handled` est vrai à notre retour, ce qui arrête la chaîne h3.
  await sendRedirect(event, LOGIN_PATH, 302)
  return undefined
})
