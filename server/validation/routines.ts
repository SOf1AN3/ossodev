import { z } from 'zod'
import { dateStringSchema, todayISO } from './tasks'

/**
 * Validation des routines (gabarits répétitifs).
 *
 * Règle croisée frequency ⇄ weekdays :
 * - `frequency = 'weekly'` ⇒ au moins un jour (0 = dimanche … 6 = samedi), non dupliqué ;
 * - `frequency = 'daily'`  ⇒ `weekdays` interdit.
 * Pour un update partiel (fréquence inconnue dans le schéma), le croisement
 * définitif est vérifié dans le repository sur l'était fusionné.
 */

const WEEKDAY_OUT_OF_RANGE = 'Jour invalide (0 = dimanche … 6 = samedi).'

export const ROUTINE_MIN_WEEKDAY_MESSAGE = 'Les routines hebdomadaires exigent au moins un jour.'
export const ROUTINE_DUPLICATE_WEEKDAY_MESSAGE = 'Les jours de la semaine ne doivent pas être dupliqués.'
export const ROUTINE_WEEKDAYS_ON_DAILY_MESSAGE = "weekdays n'est autorisé que pour les routines hebdomadaires."

export const routineFrequencySchema = z.enum(['daily', 'weekly'])

const weekdaysFieldSchema = z
  .array(z.number().int(WEEKDAY_OUT_OF_RANGE).min(0, WEEKDAY_OUT_OF_RANGE).max(6, WEEKDAY_OUT_OF_RANGE))
  .optional()

function addWeeklyIssues(weekdays: number[] | undefined, ctx: z.RefinementCtx): void {
  if (!weekdays || weekdays.length === 0) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['weekdays'], message: ROUTINE_MIN_WEEKDAY_MESSAGE })
    return
  }
  if (new Set(weekdays).size !== weekdays.length) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['weekdays'], message: ROUTINE_DUPLICATE_WEEKDAY_MESSAGE })
  }
}

export const routineCreateSchema = z
  .object({
    title: z.string().trim().min(1, 'Titre requis.').max(200, 'Titre : 200 caractères maximum.'),
    frequency: routineFrequencySchema,
    weekdays: weekdaysFieldSchema,
    points: z
      .number()
      .int('Points entiers.')
      .min(1, 'Points : 1 à 1000.')
      .max(1000, 'Points : 1 à 1000.')
      .default(10),
    is_active: z.boolean().default(true),
    start_date: dateStringSchema.default(() => todayISO()),
  })
  .superRefine((value, ctx) => {
    if (value.frequency === 'weekly') {
      addWeeklyIssues(value.weekdays, ctx)
    } else if (value.weekdays !== undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['weekdays'],
        message: ROUTINE_WEEKDAYS_ON_DAILY_MESSAGE,
      })
    }
  })
export type RoutineCreateInput = z.infer<typeof routineCreateSchema>

/** Update partielle : si `weekdays` est présent, il doit rester valide (≥ 1 jour, unique). */
export const routineUpdateSchema = z
  .object({
    title: z.string().trim().min(1, 'Titre requis.').max(200, 'Titre : 200 caractères maximum.').optional(),
    frequency: routineFrequencySchema.optional(),
    weekdays: weekdaysFieldSchema,
    points: z
      .number()
      .int('Points entiers.')
      .min(1, 'Points : 1 à 1000.')
      .max(1000, 'Points : 1 à 1000.')
      .optional(),
    is_active: z.boolean().optional(),
    start_date: dateStringSchema.optional(),
  })
  .superRefine((value, ctx) => {
    if (value.weekdays === undefined) return
    if (value.weekdays.length === 0) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['weekdays'], message: ROUTINE_MIN_WEEKDAY_MESSAGE })
      return
    }
    if (new Set(value.weekdays).size !== value.weekdays.length) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['weekdays'],
        message: ROUTINE_DUPLICATE_WEEKDAY_MESSAGE,
      })
    }
  })
export type RoutineUpdateInput = z.infer<typeof routineUpdateSchema>
