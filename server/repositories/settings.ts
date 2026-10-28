/**
 * Repository des réglages (table `settings`, clé/valeur en jsonb).
 * Drizzle strictement paramétré — aucun SQL brut, aucun accès disque,
 * aucun process shell.
 */
import { inArray } from 'drizzle-orm'
import { db } from '~~/db'
import { settings } from '~~/db/schema'
import { DEFAULT_LEAD_TEMPLATE } from '~~/server/services/prompt'
import type { Settings } from '~~/shared/types'

const SETTINGS_KEYS = ['leadIntroTemplate', 'brainCommand', 'terminalCommand'] as const

type SettingsKey = (typeof SETTINGS_KEYS)[number]

const DEFAULTS: Settings = {
  leadIntroTemplate: DEFAULT_LEAD_TEMPLATE,
  brainCommand: '',
  terminalCommand: '',
}

/** Lecture des réglages avec repli sur les valeurs par défaut si clé absente. */
export async function getSettings(): Promise<Settings> {
  const rows = await db
    .select({ key: settings.key, value: settings.value })
    .from(settings)
    .where(inArray(settings.key, [...SETTINGS_KEYS]))

  const stored = new Map<string, unknown>(rows.map((row) => [row.key, row.value]))

  const read = (key: SettingsKey): string => {
    const raw = stored.get(key)
    return typeof raw === 'string' ? raw : DEFAULTS[key]
  }

  return {
    leadIntroTemplate: read('leadIntroTemplate'),
    brainCommand: read('brainCommand'),
    terminalCommand: read('terminalCommand'),
  }
}

/**
 * Mise à jour partielle (upsert par clé, `updated_at` rafraîchi),
 * puis relecture complète.
 */
export async function saveSettings(partial: Partial<Settings>): Promise<Settings> {
  const updates: Array<{ key: SettingsKey; value: string }> = []
  if (typeof partial.leadIntroTemplate === 'string') {
    updates.push({ key: 'leadIntroTemplate', value: partial.leadIntroTemplate })
  }
  if (typeof partial.brainCommand === 'string') {
    updates.push({ key: 'brainCommand', value: partial.brainCommand })
  }
  if (typeof partial.terminalCommand === 'string') {
    updates.push({ key: 'terminalCommand', value: partial.terminalCommand })
  }

  for (const update of updates) {
    const now = new Date()
    await db
      .insert(settings)
      .values({ key: update.key, value: update.value, updated_at: now })
      .onConflictDoUpdate({
        target: settings.key,
        set: { value: update.value, updated_at: now },
      })
  }

  return getSettings()
}
