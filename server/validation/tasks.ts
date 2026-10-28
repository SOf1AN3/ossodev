import { z } from 'zod'
import type { Weekday } from '~~/shared/types'

/**
 * Validation des tâches + utilitaires de date civile.
 *
 * Sémantique des dates (CRUCIAL) :
 * - `scheduled_date` est une date civile `YYYY-MM-DD` SANS fuseau.
 * - « Aujourd'hui » doit donc être calculé avec les composantes LOCALES de `Date`,
 *   jamais via `toISOString()` (qui convertit en UTC et décale le jour).
 */

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/

/** Vrai si la chaîne est une date civile réellement existante (calendrier local). */
export function isValidDateString(value: string): boolean {
  if (!DATE_PATTERN.test(value)) return false
  const [year, month, day] = value.split('-').map(Number)
  const parsed = new Date(year, month - 1, day)
  return (
    parsed.getFullYear() === year &&
    parsed.getMonth() === month - 1 &&
    parsed.getDate() === day
  )
}

/** Formate une Date en date civile LOCALE `YYYY-MM-DD`. */
export function formatLocalDate(date: Date): string {
  const year = String(date.getFullYear()).padStart(4, '0')
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

/** « Aujourd'hui » en date civile LOCALE (jamais UTC). */
export function todayISO(): string {
  return formatLocalDate(new Date())
}

/** Parse une date civile `YYYY-MM-DD` en Date à minuit local. */
export function parseLocalDate(value: string): Date {
  const [year, month, day] = value.split('-').map(Number)
  return new Date(year, month - 1, day)
}

/** Ajoute un nombre de jours à une date civile (arithmétique locale, DST-safe). */
export function addDaysISO(value: string, days: number): string {
  const date = parseLocalDate(value)
  date.setDate(date.getDate() + days)
  return formatLocalDate(date)
}

/** Jour de la semaine JS d'une date civile : 0 = dimanche … 6 = samedi. */
export function weekdayOf(value: string): Weekday {
  return parseLocalDate(value).getDay() as Weekday
}

/** Nombre de jours entiers entre deux dates civiles (to - from). */
export function daysBetweenISO(from: string, to: string): number {
  const deltaMs = parseLocalDate(to).getTime() - parseLocalDate(from).getTime()
  return Math.round(deltaMs / 86_400_000)
}

/** Schéma réutilisable : date civile `YYYY-MM-DD`, calendrier local validé. */
export const dateStringSchema = z
  .string()
  .regex(DATE_PATTERN, 'Format attendu : AAAA-MM-JJ')
  .refine(isValidDateString, 'Date invalide.')

// ---------------------------------------------------------------------------
// Tâches
// ---------------------------------------------------------------------------

export const taskStatusSchema = z.enum(['todo', 'doing', 'done'])
export const taskSourceSchema = z.enum(['oneoff', 'routine'])

export const taskCreateSchema = z.object({
  title: z.string().trim().min(1, 'Titre requis.').max(200, 'Titre : 200 caractères maximum.'),
  notes: z.string().nullish(),
  status: taskStatusSchema.default('todo'),
  priority: z
    .number()
    .int('Priorité entière.')
    .min(1, 'Priorité : 1 (haute) à 3 (basse).')
    .max(3, 'Priorité : 1 (haute) à 3 (basse).')
    .default(2),
  source: taskSourceSchema.default('oneoff'),
  scheduled_date: dateStringSchema.default(() => todayISO()),
  points: z
    .number()
    .int('Points entiers.')
    .min(1, 'Points : 1 à 1000.')
    .max(1000, 'Points : 1 à 1000.')
    .default(10),
})
export type TaskCreateInput = z.infer<typeof taskCreateSchema>

/** Update partielle : tous les champs sont facultatifs. */
export const taskUpdateSchema = z.object({
  title: z.string().trim().min(1, 'Titre requis.').max(200, 'Titre : 200 caractères maximum.').optional(),
  notes: z.string().nullish(),
  status: taskStatusSchema.optional(),
  priority: z
    .number()
    .int('Priorité entière.')
    .min(1, 'Priorité : 1 (haute) à 3 (basse).')
    .max(3, 'Priorité : 1 (haute) à 3 (basse).')
    .optional(),
  source: taskSourceSchema.optional(),
  scheduled_date: dateStringSchema.optional(),
  points: z.number().int('Points entiers.').min(1, 'Points : 1 à 1000.').max(1000, 'Points : 1 à 1000.').optional(),
})
export type TaskUpdateInput = z.infer<typeof taskUpdateSchema>

/** Re-planification manuelle (POST /api/tasks/[id]/move). */
export const moveSchema = z.object({
  scheduled_date: dateStringSchema,
})
export type MoveInput = z.infer<typeof moveSchema>

/** Query facultative de GET /api/tasks. */
export const taskListQuerySchema = z.object({
  view: z.literal('today').optional(),
  from: dateStringSchema.optional(),
  to: dateStringSchema.optional(),
  status: taskStatusSchema.optional(),
})
export type TaskListQuery = z.infer<typeof taskListQuerySchema>
