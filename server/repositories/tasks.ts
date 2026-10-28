import { and, asc, eq, gte, lt, lte, ne, or } from 'drizzle-orm'
import type { SQL } from 'drizzle-orm'
import { routines, tasks } from '~~/db/schema'
import { db } from '~~/db'
import type { Task, TaskSource, TaskStatus, Weekday } from '~~/shared/types'
import { badRequest } from '~~/server/utils/http'
import { addDaysISO, daysBetweenISO, todayISO, weekdayOf } from '~~/server/validation/tasks'
import type { TaskCreateInput, TaskListQuery, TaskUpdateInput } from '~~/server/validation/tasks'

/**
 * Repository des tâches perso (one-off OU instance de routine).
 * Toute la logique métier vit ici, jamais dans les routes.
 */

type TaskRow = typeof tasks.$inferSelect
type RoutineRow = typeof routines.$inferSelect

/** Tâche partagée amplifiée du marqueur de retard calculé côté serveur. */
export type TaskWithOverdue = Task & { is_overdue: boolean }

/** Gabarit de routine minimal requis pour calculer une échéance quotidienne. */
export interface RoutineSchedule {
  frequency: string
  weekdays: number[] | null
}

/** Plafond de l'intervalle `from`/`to` de GET /api/tasks (anti-abus). */
export const MAX_RANGE_DAYS = 60

/** La colonne DB est contrainte par un CHECK : ces garde-fous sont inatteignables. */
export function toTaskStatus(value: string): TaskStatus {
  if (value === 'todo' || value === 'doing' || value === 'done') return value
  return 'todo'
}

export function toTaskSource(value: string): TaskSource {
  if (value === 'oneoff' || value === 'routine') return value
  return 'oneoff'
}

/**
 * Une tâche est en retard si elle est planifiée AVANT aujourd'hui et non terminée.
 * Elle reste visible (jamais déplacée silencieusement) — le marqueur `is_overdue`
 * est calculé ici, côté serveur, à partir de la date LOCALE courante.
 */
export function isOverdue(scheduledDate: string, status: string, today: string): boolean {
  return scheduledDate < today && status !== 'done'
}

/** Une routine est due ce jour-là si `daily`, ou `weekly` avec ce jour JS (0 = dimanche). */
export function isRoutineDueOn(routine: RoutineSchedule, day: Weekday): boolean {
  if (routine.frequency === 'daily') return true
  if (routine.frequency === 'weekly') {
    return Array.isArray(routine.weekdays) && routine.weekdays.includes(day)
  }
  return false
}

function mapTaskRow(row: TaskRow): Task {
  return {
    id: row.id,
    title: row.title,
    notes: row.notes,
    status: toTaskStatus(row.status),
    priority: row.priority,
    source: toTaskSource(row.source),
    scheduled_date: row.scheduled_date,
    routine_id: row.routine_id,
    points: row.points,
    completed_at: row.completed_at ? row.completed_at.toISOString() : null,
    created_at: row.created_at.toISOString(),
    updated_at: row.updated_at.toISOString(),
  }
}

function withOverdue(task: Task, today: string): TaskWithOverdue {
  return { ...task, is_overdue: isOverdue(task.scheduled_date, task.status, today) }
}

/**
 * Génération paresseuse des instances de routines (aucun cron).
 *
 * Idempotent par conception : l'index unique partiel `uniq_routine_instance`
 * (routine_id, scheduled_date) + `ON CONFLICT DO NOTHING` garantissent zéro
 * doublon, quel que soit le nombre d'appels concurrents.
 * Retourne le nombre d'instances réellement créées.
 */
export async function ensureRoutineInstances(dateISO: string): Promise<number> {
  const candidates = await db
    .select()
    .from(routines)
    .where(and(eq(routines.is_active, true), lte(routines.start_date, dateISO)))

  const day = weekdayOf(dateISO)
  const due = candidates.filter((routine) => isRoutineDueOn(routine, day))
  if (due.length === 0) return 0

  const now = new Date()
  const inserted = await db
    .insert(tasks)
    .values(
      due.map((routine) => ({
        title: routine.title,
        status: 'todo' as const,
        priority: 2,
        source: 'routine' as const,
        scheduled_date: dateISO,
        routine_id: routine.id,
        points: routine.points,
        updated_at: now,
      })),
    )
    .onConflictDoNothing()
    .returning({ id: tasks.id })

  return inserted.length
}

async function listTasksInRange(
  from: string,
  to: string | undefined,
  status: TaskStatus | undefined,
  today: string,
): Promise<TaskWithOverdue[]> {
  if (to === undefined) {
    badRequest('Le paramètre « to » est requis lorsque « from » est fourni.')
  }
  const span = daysBetweenISO(from, to)
  if (span < 0) {
    badRequest('Intervalle invalide : « to » ne peut pas précéder « from ».')
  }
  // Plafonné à MAX_RANGE_DAYS jours (bornes incluses), anti-abus.
  const cappedTo = span >= MAX_RANGE_DAYS ? addDaysISO(from, MAX_RANGE_DAYS - 1) : to

  const totalDays = daysBetweenISO(from, cappedTo) + 1
  for (let offset = 0; offset < totalDays; offset++) {
    await ensureRoutineInstances(addDaysISO(from, offset))
  }

  const filters: (SQL | undefined)[] = [
    gte(tasks.scheduled_date, from),
    lte(tasks.scheduled_date, cappedTo),
  ]
  if (status !== undefined) filters.push(eq(tasks.status, status))

  const rows = await db
    .select()
    .from(tasks)
    .where(and(...filters))
    .orderBy(asc(tasks.scheduled_date), asc(tasks.priority))

  return rows.map((row) => withOverdue(mapTaskRow(row), today))
}

/**
 * Liste des tâches.
 * - Vue « today » (défaut ou `view=today`) : `scheduled_date = aujourd'hui` (tous
 *   statuts, `done` inclus) PLUS les retards (`scheduled_date < aujourd'hui AND status <> 'done'`).
 * - Intervalle `from`/`to` : génération paresseuse pour chaque jour, puis sélection
 *   de l'intervalle (plafond MAX_RANGE_DAYS jours, `to` vaut `from` si absent).
 * Tri : retards d'abord (date asc), puis date asc, puis priorité asc.
 */
export async function listTasks(query: TaskListQuery): Promise<TaskWithOverdue[]> {
  const today = todayISO()

  if (query.from === undefined) {
    if (query.to !== undefined) {
      badRequest('Le paramètre « to » nécessite « from ».')
    }
    await ensureRoutineInstances(today)

    const filters: (SQL | undefined)[] = [
      or(
        eq(tasks.scheduled_date, today),
        and(lt(tasks.scheduled_date, today), ne(tasks.status, 'done')),
      ),
    ]
    if (query.status !== undefined) filters.push(eq(tasks.status, query.status))

    const rows = await db
      .select()
      .from(tasks)
      .where(and(...filters))
      .orderBy(asc(tasks.scheduled_date), asc(tasks.priority))

    const result = rows.map((row) => withOverdue(mapTaskRow(row), today))
    result.sort((a, b) => {
      if (a.is_overdue !== b.is_overdue) return a.is_overdue ? -1 : 1
      if (a.scheduled_date !== b.scheduled_date) {
        return a.scheduled_date < b.scheduled_date ? -1 : 1
      }
      return a.priority - b.priority
    })
    return result
  }

  return listTasksInRange(query.from, query.to, query.status, today)
}

export async function createTask(input: TaskCreateInput): Promise<TaskWithOverdue> {
  const now = new Date()
  const rows = await db
    .insert(tasks)
    .values({
      title: input.title,
      notes: input.notes ?? null,
      status: input.status,
      priority: input.priority,
      source: input.source,
      scheduled_date: input.scheduled_date,
      points: input.points,
      // created_at / updated_at : defaults DB.
      completed_at: input.status === 'done' ? now : null,
      updated_at: now,
    })
    .returning()

  return withOverdue(mapTaskRow(rows[0]), todayISO())
}

/**
 * Update partielle. Si `status` est fourni : `done` → `completed_at` = maintenant (ISO),
 * sinon → `completed_at` = null. `updated_at` est toujours rafraîchi.
 * Retourne `null` si la tâche n'existe pas (→ 404 côté route).
 */
export async function updateTask(id: string, input: TaskUpdateInput): Promise<TaskWithOverdue | null> {
  const now = new Date()
  const values: {
    title?: string
    notes?: string | null
    status?: TaskStatus
    priority?: number
    source?: TaskSource
    scheduled_date?: string
    points?: number
    completed_at?: Date | null
    updated_at: Date
  } = { updated_at: now }

  if (input.title !== undefined) values.title = input.title
  if (input.notes !== undefined) values.notes = input.notes
  if (input.status !== undefined) {
    values.status = input.status
    values.completed_at = input.status === 'done' ? now : null
  }
  if (input.priority !== undefined) values.priority = input.priority
  if (input.source !== undefined) values.source = input.source
  if (input.scheduled_date !== undefined) values.scheduled_date = input.scheduled_date
  if (input.points !== undefined) values.points = input.points

  const rows = await db
    .update(tasks)
    .set(values)
    .where(eq(tasks.id, id))
    .returning()

  if (rows.length === 0) return null
  return withOverdue(mapTaskRow(rows[0]), todayISO())
}

/** Re-planification manuelle (utile pour sortir un retard). Met à jour `updated_at`. */
export async function moveTask(id: string, scheduledDate: string): Promise<TaskWithOverdue | null> {
  const rows = await db
    .update(tasks)
    .set({ scheduled_date: scheduledDate, updated_at: new Date() })
    .where(eq(tasks.id, id))
    .returning()

  if (rows.length === 0) return null
  return withOverdue(mapTaskRow(rows[0]), todayISO())
}

/** Suppression franche. Retourne l'id supprimé, ou `null` si la tâche n'existe pas. */
export async function deleteTask(id: string): Promise<string | null> {
  const rows = await db
    .delete(tasks)
    .where(eq(tasks.id, id))
    .returning({ id: tasks.id })

  return rows.length > 0 ? rows[0].id : null
}
