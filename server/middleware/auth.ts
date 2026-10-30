/**
 * Basic Auth de l'intégralité du dashboard OSSO — pages HTML comme API.
 *
 * Le dashboard n'a pas de session : il va être déployé publiquement sur Vercel,
 * tout doit donc passer par un seul secret (racine `/` comprise).
 *
 * - `DASHBOARD_PASSWORD` vit **uniquement** dans `.env` (jamais dans Supabase,
 *   jamais côté client, jamais dans un log). S'il est absent ou vide, on
 *   n'autorise **rien** (fail-closed) : un 501 explicite en français plutôt
 *   qu'un site laissé ouvert par défaut ou un crash muet.
 * - Seules les routes sous `/api/companion/` sont exemptées : elles
 *   s'authentifient déjà elles-mêmes via un Bearer HMAC
 *   (`server/utils/companionAuth.ts`).
 * - La comparaison du mot de passe est en **temps constant** : chaque valeur
 *   est hachée en SHA-256 (longueur fixe de 32 octets) puis comparée via
 *   `crypto.timingSafeEqual` — jamais de `===` sur le secret, aucune fuite de
 *   longueur ni de contenu par le chronomètre.
 * - Un échec renvoie 401 + `WWW-Authenticate: Basic realm="OSSO",
 *   charset="UTF-8"` (popup navigateur) et l'enveloppe `{ error: { code,
 *   message } }` de l'API.
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
import { createHash, timingSafeEqual } from 'node:crypto'
import { defineEventHandler, getHeader, setHeader, setResponseStatus } from 'h3'
import type { H3Event } from 'h3'
import type { ApiFailure } from '~~/server/utils/http'

/** Schéma de l'en-tête attendu. */
const BASIC_PREFIX = 'Basic '

/** Unique préfixe de chemin exempté : routes Companion (déjà protégées par HMAC). */
const COMPANION_PREFIX = '/api/companion/'

/** Déclenche le popup d'authentification du navigateur à chaque refus. */
const WWW_AUTHENTICATE = 'Basic realm="OSSO", charset="UTF-8"'

/**
 * Forme base64 standard. `Buffer.from(x, 'base64')` n'élève **jamais** d'erreur
 * (il ignore silencieusement les caractères invalides) : on valide donc la
 * forme avant de décoder, sinon un en-tête corrompu serait traité à l'aveugle.
 */
const BASE64_PATTERN = /^[A-Za-z0-9+/]+={0,2}$/

/**
 * Mot de passe du dashboard. `undefined` si la variable est absente ou vide :
 * l'appelant doit alors **tout** refuser (fail-closed).
 * (Lit `process.env` : `runtimeConfig` n'est pas fiable hors requête en dev.)
 */
function readDashboardPassword(): string | undefined {
  const password = process.env.DASHBOARD_PASSWORD
  if (typeof password !== 'string' || password.trim().length === 0) {
    return undefined
  }
  // On ne trimme que pour détecter le vide : la comparaison se fait sur la
  // valeur brute, exactement comme `requireCompanionSecret` le fait côté Companion.
  return password
}

/**
 * Chemin normalisé pour les comparaisons de préfixe : query string retirée et
 * barres doubles aplaties. `event.path` contient encore la query string (h3 a
 * déjà décodé les `%XX` du chemin avant d'atteindre les middlewares).
 */
function normalizePath(rawPath: string): string {
  const queryIndex = rawPath.indexOf('?')
  const pathname = queryIndex === -1 ? rawPath : rawPath.slice(0, queryIndex)
  const collapsed = pathname.replace(/\/{2,}/g, '/')
  return collapsed.length === 0 ? '/' : collapsed
}

/**
 * Mot de passe porté par `Authorization: Basic <base64(user:motdepasse)>`.
 * Le nom d'utilisateur est ignoré (il n'y a qu'un seul secret) : seule la
 * partie située après le premier `:` nous intéresse.
 * `undefined` si l'en-tête est absent, si le schéma n'est pas `Basic`, si le
 * base64 est invalide ou s'il n'y a pas de `:` — autant de cas refusés (401).
 */
function extractBasicPassword(header: string | undefined): string | undefined {
  if (typeof header !== 'string' || !header.startsWith(BASIC_PREFIX)) {
    return undefined
  }

  const encoded = header.slice(BASIC_PREFIX.length).trim()
  // Longueur % 4 === 1 : seule taille impossible pour du base64 (avec ou sans padding).
  if (encoded.length === 0 || encoded.length % 4 === 1 || !BASE64_PATTERN.test(encoded)) {
    return undefined
  }

  const decoded = Buffer.from(encoded, 'base64').toString('utf8')
  const separator = decoded.indexOf(':')
  if (separator === -1) {
    return undefined
  }
  return decoded.slice(separator + 1)
}

/**
 * Comparaison à temps constant : hachage SHA-256 (taille fixe) puis
 * `timingSafeEqual`. Évite toute fuite de longueur et supporte des entrées de
 * longueurs différentes sans lever.
 * (Même technique que `constantTimeEquals` dans `server/utils/companionAuth.ts`.)
 */
function constantTimeEquals(a: string, b: string): boolean {
  const hashA = createHash('sha256').update(a, 'utf8').digest()
  const hashB = createHash('sha256').update(b, 'utf8').digest()
  return timingSafeEqual(hashA, hashB)
}

/**
 * 401 + `WWW-Authenticate` (popup navigateur) + enveloppe normalisée.
 * La valeur est retournée au middleware h3, ce qui arrête la chaîne (voir
 * l'en-tête du fichier).
 */
function unauthorized(event: H3Event, code: string, message: string): ApiFailure {
  setHeader(event, 'WWW-Authenticate', WWW_AUTHENTICATE)
  setResponseStatus(event, 401)
  return { error: { code, message } }
}

/**
 * Middleware global : protège **toutes** les routes et **toutes** les pages,
 * sauf celles situées sous `/api/companion/`.
 * Retour `undefined` = autorisé : la requête continue vers la route ou la page.
 */
export default defineEventHandler((event: H3Event): ApiFailure | undefined => {
  // 1. Fail-closed : sans mot de passe configuré, rien ne passe — ni les pages,
  //    ni l'API, ni les routes Companion. On refuse avant toute autre lecture.
  const expected = readDashboardPassword()
  if (expected === undefined) {
    setResponseStatus(event, 501)
    return {
      error: {
        code: 'DASHBOARD_PASSWORD_MANQUANT',
        message:
          "DASHBOARD_PASSWORD manquant ou vide — définis la variable d'environnement DASHBOARD_PASSWORD (fichier .env) puis redéploie : aucune requête n'est autorisée sans elle.",
      },
    }
  }

  // 2. Routes Companion : elles s'authentifient déjà via Bearer HMAC
  //    (`requireCompanionAuth`), on leur laisse la main.
  if (normalizePath(event.path).startsWith(COMPANION_PREFIX)) {
    return undefined
  }

  // 3. En-tête `Authorization: Basic …` absent ou malformé → 401 (popup).
  const provided = extractBasicPassword(getHeader(event, 'authorization'))
  if (provided === undefined) {
    return unauthorized(
      event,
      'AUTHORIZATION_INVALIDE',
      'Authentification requise : en-tête Authorization: Basic <base64(motdepasse)> absent ou invalide.',
    )
  }

  // 4. Comparaison en temps constant — jamais de `===` sur le secret.
  if (!constantTimeEquals(provided, expected)) {
    return unauthorized(event, 'UNAUTHORIZED', 'Mot de passe incorrect.')
  }

  // Autorisé : on passe la main.
  return undefined
})
