/**
 * Config locale + journal du Companion.
 *
 * - Lit `%APPDATA%\osso-companion\config.json` (écrit par `scripts/companion-init.mjs`
 *   côté OSSO). Jamais de secret en dur ici.
 * - Journal dans `%APPDATA%\osso-companion\log.txt` avec rotation à 1 Mo.
 *   Le secret est systématiquement masqué, jamais de prompt complet.
 */

import fs from 'node:fs'
import path from 'node:path'

export interface CompanionConfig {
  oss_url: string
  secret: string
  dev_root: string
  brain_command: string
  terminal_command: string
  poll_interval_ms: number
}

export class ConfigError extends Error {}

/** Dossier de données du Companion : `%APPDATA%\osso-companion`. */
export function appDataDir(): string {
  const base = process.env.APPDATA
  if (base === undefined || base.length === 0) {
    throw new ConfigError('Variable APPDATA introuvable : impossible de localiser la config du Companion.')
  }
  return path.join(base, 'osso-companion')
}

export function configFilePath(): string {
  return path.join(appDataDir(), 'config.json')
}

// ── Journal ──────────────────────────────────────────────────────────────────

const MAX_LOG_BYTES = 1_048_576 // 1 Mo
const MAX_LOG_CHARS = 1_000

let secretRedaction = ''

/** Inscrit le secret pour qu'il soit masqué dans tous les journaux. */
export function registerSecretRedaction(secret: string): void {
  secretRedaction = secret
}

function sanitize(message: string): string {
  let out = message.replace(/[\r\n]+/g, ' ')
  if (secretRedaction.length > 0) {
    out = out.split(secretRedaction).join('[secret masqué]')
  }
  if (out.length > MAX_LOG_CHARS) {
    out = `${out.slice(0, MAX_LOG_CHARS)}…`
  }
  return out
}

/** Écrit une ligne au journal. Le logger ne doit jamais faire planter l'app. */
export function log(level: 'INFO' | 'WARN' | 'ERROR', message: string): void {
  try {
    const dir = appDataDir()
    fs.mkdirSync(dir, { recursive: true })
    const file = path.join(dir, 'log.txt')
    try {
      const stat = fs.statSync(file)
      if (stat.size > MAX_LOG_BYTES) {
        fs.renameSync(file, path.join(dir, 'log.old.txt'))
      }
    } catch {
      // Pas encore de fichier → rien à tourner.
    }
    const line = `${new Date().toISOString()} ${level} ${sanitize(message)}\n`
    fs.appendFileSync(file, line, 'utf8')
  } catch {
    // Le journal est best effort.
  }
}

// ── Chargement de la config ──────────────────────────────────────────────────

const CONFIG_HINT = 'Relance « node scripts/companion-init.mjs » depuis OSSO pour la (re)créer.'

function readString(record: Record<string, unknown>, key: string): string {
  const value = record[key]
  return typeof value === 'string' ? value : ''
}

export function loadConfig(): CompanionConfig {
  const file = configFilePath()

  let raw: string
  try {
    raw = fs.readFileSync(file, 'utf8')
  } catch {
    throw new ConfigError(`Configuration introuvable : ${file}. ${CONFIG_HINT}`)
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    throw new ConfigError(`Configuration illisible (JSON invalide) : ${file}. ${CONFIG_HINT}`)
  }

  if (typeof parsed !== 'object' || parsed === null) {
    throw new ConfigError(`Configuration invalide (objet attendu) : ${file}. ${CONFIG_HINT}`)
  }
  const record = parsed as Record<string, unknown>

  const oss_url = readString(record, 'oss_url').trim()
  const secret = readString(record, 'secret').trim()
  const dev_root = readString(record, 'dev_root').trim()

  if (oss_url.length === 0 || secret.length === 0 || dev_root.length === 0) {
    throw new ConfigError(`Configuration incomplète (${file}) : oss_url, secret et dev_root sont requis. ${CONFIG_HINT}`)
  }
  if (/^https?:\/\/[^\s]+$/.test(oss_url) === false) {
    throw new ConfigError(`Configuration invalide : oss_url doit être une URL http(s), reçu « ${oss_url} ». ${CONFIG_HINT}`)
  }
  // dev_root vient du fichier local de confiance, contrôle souple : chemin absolu Windows.
  if (/^[A-Za-z]:[\\/]/.test(dev_root) === false) {
    throw new ConfigError(`Configuration invalide : dev_root doit être un chemin absolu Windows (ex : C:/Users/…/dev), reçu « ${dev_root} ». ${CONFIG_HINT}`)
  }

  const pollRaw = record.poll_interval_ms
  const poll_interval_ms = typeof pollRaw === 'number' && Number.isFinite(pollRaw) && pollRaw >= 1_000
    ? Math.floor(pollRaw)
    : 7_000

  return {
    oss_url: oss_url.replace(/\/+$/, ''),
    secret,
    dev_root,
    brain_command: readString(record, 'brain_command'),
    terminal_command: readString(record, 'terminal_command'),
    poll_interval_ms,
  }
}

// ── Petits utilitaires partagés ──────────────────────────────────────────────

export function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message
  if (typeof error === 'string') return error
  try {
    return JSON.stringify(error)
  } catch {
    return 'erreur inconnue'
  }
}

export function truncate(text: string, max: number): string {
  if (text.length <= max) return text
  return `${text.slice(0, max)}…`
}
