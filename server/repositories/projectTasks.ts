/**
 * Repository des checklists (project_tasks).
 * Drizzle strictement paramétré — aucun SQL brut, aucun accès disque.
 */
import { asc, eq, sql } from 'drizzle-orm'
import { db } from '~~/db'
import { projectTasks, projects } from '~~/db/schema'
import { badRequest, notFound } from '~~/server/utils/http'
import type { ProjectTaskCreateInput, ProjectTaskUpdateInput } from '~~/server/validation/projects'

export type ProjectTaskRow = typeof projectTasks.$inferSelect

/** Checklist complète d'un projet, triée par position puis création. */
export async function listTasks(projectId: string): Promise<ProjectTaskRow[]> {
  return db
    .select()
    .from(projectTasks)
    .where(eq(projectTasks.project_id, projectId))
    .orderBy(asc(projectTasks.position), asc(projectTasks.created_at))
}

/**
 * Ajoute une tâche. Sans `position`, elle est placée à la fin
 * (`max(position) + 1`, ou `0` si la checklist est vide).
 */
export async function addTask(
  projectId: string,
  input: ProjectTaskCreateInput,
): Promise<ProjectTaskRow> {
  const project = await db
    .select({ id: projects.id })
    .from(projects)
    .where(eq(projects.id, projectId))
    .limit(1)
  if (project.length === 0) notFound('Projet')

  let position = input.position
  if (position === undefined) {
    const rows = await db
      .select({ maxPosition: sql<number | null>`max(${projectTasks.position})` })
      .from(projectTasks)
      .where(eq(projectTasks.project_id, projectId))
    const maxPosition = rows[0]?.maxPosition ?? null
    position = maxPosition === null ? 0 : Number(maxPosition) + 1
  }

  const created = await db
    .insert(projectTasks)
    .values({
      project_id: projectId,
      title: input.title,
      position,
      is_done: input.is_done,
    })
    .returning()

  const row = created[0]
  if (!row) badRequest('Ajout de la tâche impossible.')
  return row
}

/**
 * Met à jour une tâche. 404 si absente ; la tâche doit appartenir
 * au projet de la route, sinon rejet.
 */
export async function updateTask(
  projectId: string,
  taskId: string,
  input: ProjectTaskUpdateInput,
): Promise<ProjectTaskRow> {
  const found = await db
    .select()
    .from(projectTasks)
    .where(eq(projectTasks.id, taskId))
    .limit(1)
  const task = found[0]
  if (!task) notFound('Tâche')
  if (task.project_id !== projectId) badRequest("Cette tâche n'appartient pas à ce projet.")

  const patch: Partial<ProjectTaskRow> = { updated_at: new Date() }
  if (input.title !== undefined) patch.title = input.title
  if (input.position !== undefined) patch.position = input.position
  if (input.is_done !== undefined) patch.is_done = input.is_done

  const updated = await db
    .update(projectTasks)
    .set(patch)
    .where(eq(projectTasks.id, taskId))
    .returning()

  const row = updated[0]
  if (!row) notFound('Tâche')
  return row
}

/** Supprime une tâche. La tâche doit appartenir au projet de la route. */
export async function deleteTask(projectId: string, taskId: string): Promise<void> {
  const found = await db
    .select({ id: projectTasks.id, project_id: projectTasks.project_id })
    .from(projectTasks)
    .where(eq(projectTasks.id, taskId))
    .limit(1)
  const task = found[0]
  if (!task) notFound('Tâche')
  if (task.project_id !== projectId) notFound('Tâche')
  await db.delete(projectTasks).where(eq(projectTasks.id, taskId))
}

/**
 * Réordonne la checklist dans une transaction :
 * 1. vérifie que chaque id de `order` appartient au projet (sinon 400 + rollback),
 * 2. réécrit `position = index` pour chaque id de `order`,
 * 3. recalcule aussi les tâches absentes de `order` en fin de liste
 *    (positions continues, zéro trou, zéro doublon, zéro tâche perdue).
 */
export async function reorderTasks(projectId: string, order: string[]): Promise<void> {
  const uniqueOrder = [...new Set(order)]

  await db.transaction(async (tx) => {
    const existing = await tx
      .select({ id: projectTasks.id })
      .from(projectTasks)
      .where(eq(projectTasks.project_id, projectId))
      .orderBy(asc(projectTasks.position), asc(projectTasks.created_at))

    const existingIds = new Set(existing.map((task) => task.id))
    for (const id of uniqueOrder) {
      if (!existingIds.has(id)) badRequest('Liste de réordonnancement invalide.')
    }

    for (const [index, id] of uniqueOrder.entries()) {
      await tx
        .update(projectTasks)
        .set({ position: index, updated_at: new Date() })
        .where(eq(projectTasks.id, id))
    }

    const reordered = new Set(uniqueOrder)
    let nextPosition = uniqueOrder.length
    for (const task of existing) {
      if (reordered.has(task.id)) continue
      await tx
        .update(projectTasks)
        .set({ position: nextPosition, updated_at: new Date() })
        .where(eq(projectTasks.id, task.id))
      nextPosition += 1
    }
  })
}
