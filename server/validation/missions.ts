import { z } from 'zod'
import { addDaysISO, weekdayOf } from '~~/server/validation/tasks'

/**
 * Validation & utilitaires de date pour les missions hebdomadaires.
 *
 * Semaine ISO civile : lundi → dimanche (le `week_start` est TOUJOURS calculé
 * côté serveur, jamais reçu du client).
 */

/** Lundi de la semaine contenant `dateISO` (date civile locale). */
export function startOfWeek(dateISO: string): string {
  const day = weekdayOf(dateISO) // 0 = dimanche … 6 = samedi
  const daysSinceMonday = (day + 6) % 7
  return addDaysISO(dateISO, -daysSinceMonday)
}

/** Bornes [lundi, dimanche] de la semaine contenant `dateISO`. */
export function weekRange(dateISO: string): { weekStart: string; weekEnd: string } {
  const weekStart = startOfWeek(dateISO)
  return { weekStart, weekEnd: addDaysISO(weekStart, 6) }
}

export const missionCreateSchema = z.object({
  title: z.string().trim().min(1, 'Titre requis.').max(120, 'Titre : 120 caractères maximum.'),
  target: z
    .number()
    .int('Cible entière.')
    .min(1, 'Cible : 1 à 1000.')
    .max(1000, 'Cible : 1 à 1000.'),
})
export type MissionCreateInput = z.infer<typeof missionCreateSchema>
