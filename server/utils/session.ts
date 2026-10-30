/**
 * Session du dashboard OSSO — cookie signé `osso_session` (remplace le Basic Auth).
 *
 * - **Clé dérivée, pas de nouvelle variable d'environnement** : la clé de
 *   signature est `HMAC-SHA256(key = DASHBOARD_PASSWORD, msg = "osso-session-v1")`.
 *   `DASHBOARD_PASSWORD` est déjà requis en fail-closed (501 s'il manque), donc
 *   cette clé existe toujours ; et comme elle dépend du mot de passe, un
 *   changement de mot de passe invalide toutes les sessions existantes — aucun
 *   jeton ne survit à une révocation, sans table de sessions à purger.
 * - **Jeton sans état** : valeur du cookie = `"<exp_unix>.<hmac_hex>"` où
 *   `exp = now + 604800` (7 jours) et `hmac = HMAC-SHA256(sessionKey, String(exp))`
 *   en hexadécimal. La vérification compare le HMAC en **temps constant**
 *   (`timingSafeEqual`) **puis** contrôle `exp > now` ; format invalide = refus.
 *   Aucune comparaison `===` sur un secret, aucune fuite de longueur.
 * - **Comparaison du mot de passe** : chaque valeur est hachée en SHA-256
 *   (longueur fixe de 32 octets) puis comparée via `timingSafeEqual` — même
 *   technique que `server/utils/companionAuth.ts`.
 * - `process.env` lu directement (pas `useRuntimeConfig`, peu fiable hors
 *   requête en dev).
 */
import { createHash, createHmac, timingSafeEqual } from 'node:crypto'
import { deleteCookie, getCookie, setCookie } from 'h3'
import type { H3Event } from 'h3'
import { apiError } from '~~/server/utils/http'

/** Nom du cookie portant le jeton de session (contrat UI figé). */
export const SESSION_COOKIE_NAME = 'osso_session'

/** Durée de vie du jeton : 7 jours, en secondes. */
export const SESSION_TTL_SECONDS = 604_800

/** Code + message du fail-closed, partagés entre le middleware (enveloppe
 *  manuelle, voir `server/middleware/auth.ts`) et les routes (via `apiError`). */
export const PASSWORD_MISSING_CODE = 'DASHBOARD_PASSWORD_MANQUANT'
export const PASSWORD_MISSING_MESSAGE =
  "DASHBOARD_PASSWORD manquant ou vide — définis la variable d'environnement DASHBOARD_PASSWORD (fichier .env) puis redéploie : aucune requête n'est autorisée sans elle."

/**
 * Domaine de séparation de la clé dérivée. Versionné (`v1`) : si le format du
 * jeton change un jour, changer ce préfixe invalide d'un coup toutes les
 * anciennes sessions.
 */
const KEY_PURPOSE = 'osso-session-v1'

/** HMAC-SHA256 hex = 64 caractères. */
const TOKEN_MAC_PATTERN = /^[0-9a-f]{64}$/

/** Timestamp unix en secondes (10 chiffres aujourd'hui, marge jusqu'en 2286). */
const TOKEN_EXP_PATTERN = /^\d{1,15}$/

/**
 * Mot de passe du dashboard. `undefined` si la variable est absente ou vide :
 * l'appelant doit alors **tout** refuser (fail-closed).
 * On ne trimme que pour détecter le vide : la comparaison se fait ensuite sur
 * la valeur brute, exactement comme `requireCompanionSecret` le fait côté
 * Companion.
 */
export function readDashboardPassword(): string | undefined {
  const password = process.env.DASHBOARD_PASSWORD
  if (typeof password !== 'string' || password.trim().length === 0) {
    return undefined
  }
  return password
}

/**
 * Mot de passe exigé : 501 explicite en français (via `runApi`) s'il est
 * absent ou vide. Utilisé par les routes, qui peuvent laisser `runApi`
 * formater l'enveloppe.
 */
export function requireDashboardPassword(): string {
  const password = readDashboardPassword()
  if (password === undefined) {
    apiError(PASSWORD_MISSING_CODE, PASSWORD_MISSING_MESSAGE, 501)
  }
  return password
}

/**
 * Clé de signature dérivée : `HMAC-SHA256(key = DASHBOARD_PASSWORD, msg = "osso-session-v1")`.
 * (Voir l'en-tête du fichier : clé toujours présente puisque le mot de passe
 * est fail-closed, et changement de mot de passe = invalidation de toutes les
 * sessions.)
 */
export function sessionKeyFromPassword(password: string): string {
  return createHmac('sha256', password).update(KEY_PURPOSE, 'utf8').digest('hex')
}

/** Clé de session exigée — 501 fail-closed si `DASHBOARD_PASSWORD` manque. */
export function requireSessionKey(): string {
  return sessionKeyFromPassword(requireDashboardPassword())
}

/** Génère un jeton sans état `"<exp>.<hmac_hex>"` valable `SESSION_TTL_SECONDS`. */
export function createSessionToken(sessionKey: string, nowUnixSeconds?: number): string {
  const now = nowUnixSeconds ?? Math.floor(Date.now() / 1000)
  const exp = now + SESSION_TTL_SECONDS
  const mac = createHmac('sha256', sessionKey).update(String(exp), 'utf8').digest('hex')
  return `${exp}.${mac}`
}

/**
 * Vérifie un jeton : format valide, HMAC en temps constant **puis** expiration.
 * Tout jeton malformé (absent, sans point, HMAC non hexadécimal, exp non
 * numérique) est rejeté sans lever d'exception.
 */
export function verifySessionToken(
  sessionKey: string,
  token: string | undefined,
): boolean {
  if (typeof token !== 'string' || token.length === 0) return false

  const separator = token.indexOf('.')
  if (separator <= 0 || separator !== token.lastIndexOf('.')) return false

  const expRaw = token.slice(0, separator)
  const macHex = token.slice(separator + 1)
  if (!TOKEN_EXP_PATTERN.test(expRaw) || !TOKEN_MAC_PATTERN.test(macHex)) return false

  // 1. HMAC attendu recalculé, comparaison à temps constant sur les 32 octets.
  //    Les deux buffers font 32 octets (64 hex garanti par le format) — la
  //    longueur n'est donc pas fuitée et `timingSafeEqual` ne peut pas lever.
  const expected = createHmac('sha256', sessionKey).update(expRaw, 'utf8').digest('hex')
  const providedBytes = Buffer.from(macHex, 'hex')
  const expectedBytes = Buffer.from(expected, 'hex')
  if (providedBytes.length !== expectedBytes.length) return false
  if (!timingSafeEqual(providedBytes, expectedBytes)) return false

  // 2. Le jeton est authentique : on vérifie ensuite l'expiration.
  const exp = Number(expRaw)
  if (!Number.isSafeInteger(exp)) return false
  return exp > Math.floor(Date.now() / 1000)
}

/** Lit le jeton porté par le cookie `osso_session` (`undefined` si absent). */
export function readSessionToken(event: H3Event): string | undefined {
  return getCookie(event, SESSION_COOKIE_NAME)
}

/**
 * Options communes du cookie. `secure` uniquement en production : en `nuxt dev`
 * le trafic est en HTTP, un cookie `Secure` ne serait alors jamais stocké par le
 * navigateur et la session ne fonctionnerait pas.
 */
function sessionCookieFlags(): {
  httpOnly: true
  sameSite: 'lax'
  path: '/'
  secure: boolean
} {
  return {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    secure: process.env.NODE_ENV === 'production',
  }
}

/** Pose le cookie de session (httpOnly : inaccessible au JS, pas de vol XSS). */
export function setSessionCookie(event: H3Event, token: string): void {
  setCookie(event, SESSION_COOKIE_NAME, token, {
    ...sessionCookieFlags(),
    maxAge: SESSION_TTL_SECONDS,
  })
}

/** Supprime le cookie de session (logout) — même `path` que l'écriture. */
export function clearSessionCookie(event: H3Event): void {
  deleteCookie(event, SESSION_COOKIE_NAME, sessionCookieFlags())
}

/**
 * Comparaison à temps constant du mot de passe : hachage SHA-256 (taille fixe)
 * puis `timingSafeEqual`. Évite toute fuite de longueur et supporte des
 * entrées de longueurs différentes sans lever. (Même technique que
 * `constantTimeEquals` dans `server/utils/companionAuth.ts`.)
 */
export function passwordMatches(provided: string, expected: string): boolean {
  const providedHash = createHash('sha256').update(provided, 'utf8').digest()
  const expectedHash = createHash('sha256').update(expected, 'utf8').digest()
  return timingSafeEqual(providedHash, expectedHash)
}
