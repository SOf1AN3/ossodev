/**
 * Cœur de sécurité du Companion — défense en profondeur locale (D8).
 *
 * - Liste blanche de `command_key` : constante locale, JAMAIS étendue depuis une réponse réseau.
 * - Validation de chemin : allowlist réimplémentée ici (`assertSafeAbsolutePath`),
 *   puis confinement strict dans `dev_root`.
 * - Vérification de la signature HMAC + fraîcheur (120 s) AVANT toute exécution.
 */

import path from 'node:path'
import { computeSignature, signatureMatches } from './signature.ts'
import type { CompanionCommand } from './api.ts'

/** Les seules commandes que ce Companion accepte d'exécuter. */
export const ALLOWED_KEYS: ReadonlySet<string> = new Set([
  'opencode:lead',
  'brain:scan',
  'brain:run',
])

/** Rejeté si le chemin contient l'un de ces caractères (testé AVANT le regex). */
const FORBIDDEN_CHARS = /[\0\n\r]/

/** Allowlist de chemins Windows absolus — réimplémentation de `assertSafeAbsolutePath`. */
const SAFE_PATH_PATTERN = /^[A-Za-z]:[A-Za-z0-9 _.\-\\\/]+$/

/** Âge maximal d'une commande acceptée : 120 000 ms. */
export const MAX_COMMAND_AGE_MS = 120_000

export class SecurityError extends Error {}

/** Refuse tout `command_key` hors liste blanche. */
export function assertAllowedKey(key: string): void {
  if (ALLOWED_KEYS.has(key) === false) {
    throw new SecurityError(
      `Commande refusée : « ${key} » ne fait pas partie de la liste blanche autorisée.`,
    )
  }
}

/**
 * Valide un chemin absolu et l'encastrement strict dans `dev_root`.
 * Retourne le chemin résolu ou lève `SecurityError` avec un message clair en français.
 */
export function assertSafeAbsolutePath(rawPath: unknown, devRoot: string): string {
  if (typeof rawPath !== 'string' || rawPath.trim().length === 0) {
    throw new SecurityError('Chemin refusé : un chemin de dossier est requis (folder_path vide ou invalide).')
  }
  if (FORBIDDEN_CHARS.test(rawPath)) {
    throw new SecurityError('Chemin refusé : caractères interdits détectés (nul ou saut de ligne).')
  }
  if (SAFE_PATH_PATTERN.test(rawPath) === false) {
    throw new SecurityError(
      `Chemin refusé : « ${rawPath} » n'est pas un chemin absolu Windows autorisé ` +
      '(lettres, chiffres, espaces, points, tirets, barres obliques uniquement).',
    )
  }

  const resolved = path.resolve(rawPath)
  const root = path.resolve(devRoot)

  // Confinement strict : le chemin résolu doit être à l'intérieur de dev_root.
  const rel = path.relative(root, resolved)
  const outside = rel === '' || rel.startsWith('..') || path.isAbsolute(rel)
  if (outside) {
    throw new SecurityError(
      `Chemin refusé : « ${rawPath} » se trouve à l'extérieur du dossier de développement autorisé.`,
    )
  }
  if (FORBIDDEN_CHARS.test(resolved)) {
    throw new SecurityError('Chemin refusé : caractères interdits détectés après résolution.')
  }
  return resolved
}

/**
 * Vérifie la signature HMAC et la fraîcheur de la commande.
 * Refuse un message créé depuis plus de 120 s, même si la signature est valide
 * (pas de comparaison d'horloge avec `expires_at` : c'est le serveur qui la calcule).
 */
export function verifySignature(command: CompanionCommand, secret: string): void {
  if (typeof command.signature !== 'string' || command.signature.length === 0) {
    throw new SecurityError('Commande refusée : signature absente.')
  }
  if (typeof command.expires_at !== 'string' || typeof command.created_at !== 'string') {
    throw new SecurityError('Commande refusée : dates manquantes (created_at / expires_at).')
  }

  const createdMs = Date.parse(command.created_at)
  if (Number.isNaN(createdMs)) {
    throw new SecurityError('Commande refusée : created_at illisible.')
  }
  if (Date.now() - createdMs > MAX_COMMAND_AGE_MS) {
    throw new SecurityError(
      'Commande refusée : message trop ancien (créé depuis plus de 120 s) — rejeu bloqué.',
    )
  }

  const expected = computeSignature(
    {
      id: command.id,
      command_key: command.command_key,
      payload: command.payload,
      expires_at: command.expires_at,
    },
    secret,
  )
  if (signatureMatches(expected, command.signature) === false) {
    throw new SecurityError('Commande refusée : signature HMAC invalide.')
  }
}
