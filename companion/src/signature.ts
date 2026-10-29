/**
 * Signature HMAC-SHA256 des commandes (crypto/node, zéro dépendance).
 *
 * Message signé : `id|command_key|JSON.stringify(payload)|expires_at`
 * Comparaison à temps constant via `timingSafeEqual`.
 */

import { createHmac, timingSafeEqual } from 'node:crypto'

export interface SignableCommand {
  id: string
  command_key: string
  payload: unknown
  expires_at: string
}

/** Construit la chaîne exacte qui est signée. */
export function signingString(command: SignableCommand): string {
  return `${command.id}|${command.command_key}|${JSON.stringify(command.payload)}|${command.expires_at}`
}

/** Signature HMAC-SHA256 en hexadécimal. */
export function computeSignature(command: SignableCommand, secret: string): string {
  return createHmac('sha256', secret).update(signingString(command), 'utf8').digest('hex')
}

/** Comparaison à temps constant. */
export function signatureMatches(expected: string, actual: string): boolean {
  if (expected.length === 0 || actual.length === 0) return false
  const a = Buffer.from(expected, 'utf8')
  const b = Buffer.from(actual, 'utf8')
  if (a.length !== b.length) return false
  return timingSafeEqual(a, b)
}
