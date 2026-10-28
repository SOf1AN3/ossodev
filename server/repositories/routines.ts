import { and, asc, eq, gte, ne } from 'drizzle-orm'
import { routines, tasks } from '~~/db/schema'
import { db } from '~~/db'
import type { Routine, RoutineFrequency } from '~~/shared/types'
import { apiError, badRequest } from '~~/server/utils/http'
import { addDaysISO, todayISO, weekdayOf } from '~~/server/validation/tasks'
import {
  ROUTINE_MIN_WEEKDAY_MESSAGE,
  ROUTINE_WEEKDAYS_ON_DAILY_MESSAGE,
} from '~~/server/validation/routines'
import type { RoutineCreateInput, RoutineUpdateInput } from '~~/server/validation/routines'
import { ensureRoutineInstances, isRoutineDueOn } from './tasks'

/**
 * Repository des routines (gabarits répétitifs).
 *
 * Historique vs purge :
 * - les instances PASSÉES ou DÉJÀ FAITES sont intouchables (jamais purgées) ;
 * - seules les instances futures non faites (`scheduled_date >= aujourd'hui AND status <> 'done'`)
 *   sont purgées à la suppression du gabarit ou au changement de sa règle ;
 * - à la suppression du gabarit, les instances conservées passent à `routine_id = NULL`
 *   via le `ON DELETE SET NULL` de la clé étrangère.
 */

type RoutineRow = typeof routines.$inferSelect

const NEXT_DATES_COUNT = 5
const NEXT_DATES_HORIZON_DAYS = 400
/** Régénération après changement de gabarit : instances dues d'ici (plafond). */
export const REGEN_HORIZON_DAYS = 30

/** Gabarit amplifié des 5 prochaines dates d'occurrence (calculées côté serveur). */
export type RoutineWithNext = Routine & { next_dates: string[] }

export interface RoutineUpdateResult {
  routine: RoutineWithNext
  purgedInstances: number
  regeneratedInstances: number
}

export interface RoutineDeletion {
  id: string
  purgedInstances: number
}

/** La colonne DB est contrainte par un CHECK : `daily` par défaut est inatteignable. */
function toRoutineFrequency(value: string): RoutineFrequency {
  return value === 'weekly' ? 'weekly' : 'daily'
}

function mapRoutineRow(row: RoutineRow): Routine {
  return {
    id: row.id,
    title: row.title,
    frequency: toRoutineFrequency(row.frequency),
    weekdays: row.weekdays,
    points: row.points,
    is_active: row.is_active,
    start_date: row.start_date,
    created_at: row.created_at.toISOString(),
    updated_at: row.updated_at.toISOString(),
  }
}

function sameWeekdays(a: number[] | null, b: number[] | null): boolean {
  if (a === null || b === null) return a === b
  if (a.length !== b.length) return false
  const other = new Set(b)
  return a.every((day) => other.has(day))
}

/**
 * 5 prochaines dates d'occurrence à partir de la date LOCALE courante.
 * Respecte `start_date` ; une routine inactive n'a aucune date à venir.
 */
export function nextOccurrenceDates(routine: Routine, today: string): string[] {
  if (!routine.is_active) return []
  const base = routine.start_date > today ? routine.start_date : today
  const dates: string[] = []
  for (
    let offset = 0;
    offset < NEXT_DATES_HORIZON_DAYS && dates.length < NEXT_DATES_COUNT;
    offset++
  ) {
    const candidate = addDaysISO(base, offset)
    if (isRoutineDueOn({ frequency: routine.frequency, weekdays: routine.weekdays }, weekdayOf(candidate))) {
      dates.push(candidate)
    }
  }
  return dates
}

function withNextDates(routine: Routine, today: string): RoutineWithNext {
  return { ...routine, next_dates: nextOccurrenceDates(routine, today) }
}

/** Toutes les routines, triées par titre, avec leurs 5 prochaines dates. */
export async function listRoutines(): Promise<RoutineWithNext[]> {
  const today = todayISO()
  const rows = await db
    .select()
    .from(routines)
    .orderBy(asc(routines.title))

  return rows.map((row) => withNextDates(mapRoutineRow(row), today))
}

/**
 * Création d'un gabarit. Après insertion, l'instance du jour est générée
 * immédiatement si la routine est due aujourd'hui.
 */
export async function createRoutine(input: RoutineCreateInput): Promise<RoutineWithNext> {
  const rows = await db
    .insert(routines)
    .values({
      title: input.title,
      frequency: input.frequency,
      weekdays: input.frequency === 'weekly' ? (input.weekdays ?? null) : null,
      points: input.points,
      is_active: input.is_active,
      start_date: input.start_date,
    })
    .returning()

  const row = rows[0]
  if (row === undefined) apiError('INTERNAL', 'Création impossible.', 500)
  const created = mapRoutineRow(row)
  const today = todayISO()
  if (created.is_active && created.start_date <= today && isRoutineDueOn(created, weekdayOf(today))) {
    await ensureRoutineInstances(today)
  }
  return withNextDates(created, today)
}

/**
 * Édition d'un gabarit.
 * Si `frequency`, `weekdays` ou `start_date` a changé : purge des instances
 * futures non faites, puis régénération de celles dues d'ici (plafond
 * REGEN_HORIZON_DAYS jours). Les instances passées ou déjà faites sont
 * toujours conservées.
 */
export async function updateRoutine(
  id: string,
  input: RoutineUpdateInput,
): Promise<RoutineUpdateResult | null> {
  const existing = await db
    .select()
    .from(routines)
    .where(eq(routines.id, id))
    .limit(1)
  const current = existing[0]
  if (current === undefined) return null

  const today = todayISO()
  const currentFrequency = toRoutineFrequency(current.frequency)

  // Validation croisée sur l'état FUSIONNÉ (update partiel) :
  // hebdomadaire ⇒ au moins un jour ; quotidien ⇒ pas de weekdays.
  const mergedFrequency: RoutineFrequency = input.frequency ?? currentFrequency
  let mergedWeekdays: number[] | null =
    input.weekdays !== undefined ? input.weekdays : current.weekdays
  if (mergedFrequency === 'weekly') {
    if (mergedWeekdays === null || mergedWeekdays.length === 0) {
      badRequest(ROUTINE_MIN_WEEKDAY_MESSAGE)
    }
  } else {
    if (input.weekdays !== undefined) {
      badRequest(ROUTINE_WEEKDAYS_ON_DAILY_MESSAGE)
    }
    mergedWeekdays = null
  }
  const mergedStartDate = input.start_date ?? current.start_date

  const templateChanged =
    (input.frequency !== undefined && input.frequency !== currentFrequency) ||
    (input.weekdays !== undefined && !sameWeekdays(input.weekdays, current.weekdays)) ||
    (input.start_date !== undefined && input.start_date !== current.start_date)

  const values: {
    title?: string
    frequency: RoutineFrequency
    weekdays: number[] | null
    points?: number
    is_active?: boolean
    start_date: string
    updated_at: Date
  } = {
    frequency: mergedFrequency,
    weekdays: mergedWeekdays,
    start_date: mergedStartDate,
    updated_at: new Date(),
  }
  if (input.title !== undefined) values.title = input.title
  if (input.points !== undefined) values.points = input.points
  if (input.is_active !== undefined) values.is_active = input.is_active

  const updatedRows = await db
    .update(routines)
    .set(values)
    .where(eq(routines.id, id))
    .returning()

  const updated = updatedRows[0]
  if (updated === undefined) return null

  let purgedInstances = 0
  let regeneratedInstances = 0
  if (templateChanged) {
    purgedInstances = await purgeFutureUndoneInstances(id, today)
    for (let offset = 0; offset < REGEN_HORIZON_DAYS; offset++) {
      regeneratedInstances += await ensureRoutineInstances(addDaysISO(today, offset))
    }
  }

  return {
    routine: withNextDates(mapRoutineRow(updated), today),
    purgedInstances,
    regeneratedInstances,
  }
}

/**
 * Suppression d'un gabarit : purge des seules instances futures non faites.
 * Les instances passées et les futures déjà faites sont conservées pour
 * l'historique (`routine_id` passe à `NULL` via `ON DELETE SET NULL`).
 */
export async function deleteRoutine(id: string): Promise<RoutineDeletion | null> {
  const existing = await db
    .select({ id: routines.id })
    .from(routines)
    .where(eq(routines.id, id))
    .limit(1)
  if (existing.length === 0) return null

  const today = todayISO()
  const purgedInstances = await purgeFutureUndoneInstances(id, today)
  await db.delete(routines).where(eq(routines.id, id))

  return { id, purgedInstances }
}

async function purgeFutureUndoneInstances(routineId: string, today: string): Promise<number> {
  const purged = await db
    .delete(tasks)
    .where(
      and(
        eq(tasks.routine_id, routineId),
        gte(tasks.scheduled_date, today),
        ne(tasks.status, 'done'),
      ),
    )
    .returning({ id: tasks.id })

  return purged.length
}
