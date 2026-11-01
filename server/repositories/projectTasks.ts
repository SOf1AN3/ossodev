/**
 * Repository des checklists (project_tasks).
 * Drizzle strictement paramétré — aucun SQL brut, aucun accès disque.
 *
 * Arbre : chaque tâche porte un `parent_id` (FK auto-référente, suppression en
 * cascade DB). Les `position` sont locales à une fratrie (tâches partageant le
 * même `parent_id`) : il n'y a jamais de réindexation globale.
 *
 * Règle de statut : une tâche AVEC des filles vaut `done` si et seulement si
 * TOUTES ses filles sont `done` (la saisie manuelle d'un parent est écrasée).
 * Une tâche SANS filles garde sa coche manuelle.
 */
import { and, asc, eq, isNull, sql } from 'drizzle-orm'
import { db } from '~~/db'
import { projectTasks, projects } from '~~/db/schema'
import { badRequest, notFound } from '~~/server/utils/http'
import type { ProjectTaskCreateInput, ProjectTaskUpdateInput } from '~~/server/validation/projects'
import type { ProjectTaskNode } from '~~/shared/types'

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
 * Arbre des tâches d'un projet : racines (`parent_id = null`) + `children`
 * imbriqués, chaque fratrie triée par `position`. Une seule lecture SQL,
 * assemblage en mémoire — aucune récursion côté DB.
 */
export async function listTaskTree(projectId: string): Promise<ProjectTaskNode[]> {
  const rows = await listTasks(projectId)

  const nodes = new Map<string, ProjectTaskNode>()
  for (const row of rows) {
    nodes.set(row.id, {
      id: row.id,
      project_id: row.project_id,
      title: row.title,
      position: row.position,
      is_done: row.is_done,
      parent_id: row.parent_id,
      children: [],
    })
  }

  const roots: ProjectTaskNode[] = []
  for (const row of rows) {
    const node = nodes.get(row.id)
    if (!node) continue
    if (row.parent_id === null) {
      roots.push(node)
      continue
    }
    const parent = nodes.get(row.parent_id)
    // Un parent hors du projet ne devrait pas exister (contrôle à l'écriture) ;
    // par sécurité, la tâche est promote en racine plutôt que perdue.
    if (parent) parent.children.push(node)
    else roots.push(node)
  }

  const sortByPosition = (list: ProjectTaskNode[]): void => {
    list.sort((a, b) => a.position - b.position)
    for (const child of list) sortByPosition(child.children)
  }
  sortByPosition(roots)

  return roots
}

/**
 * Position parmi les frères : `max(position des tâches partageant le même
 * parent_id) + 1` (ou `0` si la fratrie est vide). Les racines ont
 * `parent_id = null`.
 */
async function nextSiblingPosition(projectId: string, parentId: string | null): Promise<number> {
  const rows = await db
    .select({ maxPosition: sql<number | null>`max(${projectTasks.position})` })
    .from(projectTasks)
    .where(
      parentId === null
        ? and(eq(projectTasks.project_id, projectId), isNull(projectTasks.parent_id))
        : and(eq(projectTasks.project_id, projectId), eq(projectTasks.parent_id, parentId)),
    )
  const maxPosition = rows[0]?.maxPosition ?? null
  return maxPosition === null ? 0 : Number(maxPosition) + 1
}

/**
 * Valide le parent candidat d'une tâche :
 * - il doit exister ET appartenir au même `project_id` (contrôle anti-IDOR) ;
 * - en remontant de lui jusqu'à la racine, on ne doit jamais rencontrer
 *   `childTaskId` (anti-cycle : `childTaskId` serait son propre ancêtre).
 * `childTaskId` vaut `null` à la création (la tâche n'existe pas encore, aucun
 * cycle possible). Rejet 400 `VALIDATION` dans tous les cas d'échec.
 */
async function assertValidParent(
  projectId: string,
  candidateParentId: string,
  childTaskId: string | null,
): Promise<void> {
  let currentId: string | null = candidateParentId
  const visited = new Set<string>()
  while (currentId !== null && !visited.has(currentId)) {
    if (currentId === childTaskId) {
      badRequest(
        "Une tâche ne peut pas être placée sous l'une de ses propres descendantes.",
        'VALIDATION',
      )
    }
    visited.add(currentId)
    const rows: Array<{ id: string; parent_id: string | null; project_id: string }> = await db
      .select({
        id: projectTasks.id,
        parent_id: projectTasks.parent_id,
        project_id: projectTasks.project_id,
      })
      .from(projectTasks)
      .where(eq(projectTasks.id, currentId))
      .limit(1)
    const node = rows[0]
    if (!node || node.project_id !== projectId) {
      badRequest("La tâche parente n'existe pas dans ce projet.", 'VALIDATION')
    }
    currentId = node.parent_id
  }
}

/**
 * Applique la règle de statut à partir de `startId` puis remonte la chaîne des
 * parents jusqu'à la racine :
 * - une tâche sans filles conserve sa coche manuelle (aucune écriture) ;
 * - une tâche avec des filles vaut `done` si et seulement si toutes ses
 *   filles sont `done` (écrase la saisie manuelle) — écriture seulement si
 *   la valeur diffère.
 * Le parcours va jusqu'à la racine quel que soit le résultat intermédiaire
 * (la règle s'applique à chaque ancêtre), avec garde anti-cycle.
 */
async function recalcUpwards(projectId: string, startId: string): Promise<void> {
  const rows = await listTasks(projectId)
  const byId = new Map<string, ProjectTaskRow>()
  const childrenByParent = new Map<string, ProjectTaskRow[]>()
  for (const row of rows) {
    byId.set(row.id, row)
    if (row.parent_id !== null) {
      const list = childrenByParent.get(row.parent_id)
      if (list) list.push(row)
      else childrenByParent.set(row.parent_id, [row])
    }
  }

  let currentId: string | null = startId
  const visited = new Set<string>()
  while (currentId !== null && !visited.has(currentId)) {
    visited.add(currentId)
    const current = byId.get(currentId)
    if (!current) return
    const children = childrenByParent.get(currentId)
    if (children && children.length > 0) {
      const allDone = children.every((child) => child.is_done)
      if (allDone !== current.is_done) {
        const updated = await db
          .update(projectTasks)
          .set({ is_done: allDone, updated_at: new Date() })
          .where(eq(projectTasks.id, currentId))
          .returning()
        const row = updated[0]
        if (!row) return
        byId.set(currentId, row)
      }
    }
    currentId = current.parent_id
  }
}

/**
 * Ajoute une tâche (racine si `parent_id` absent). Sans `position`, elle est
 * placée en fin de fratrie (`max(position) + 1` parmi les frères).
 * `parent_id` est validé : même projet (anti-IDOR) + anti-cycle.
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

  const parentId = input.parent_id ?? null
  if (parentId !== null) {
    await assertValidParent(projectId, parentId, null)
  }

  const position = input.position ?? (await nextSiblingPosition(projectId, parentId))

  const created = await db
    .insert(projectTasks)
    .values({
      project_id: projectId,
      parent_id: parentId,
      title: input.title,
      position,
      is_done: input.is_done,
    })
    .returning()

  const row = created[0]
  if (!row) badRequest('Ajout de la tâche impossible.')

  // Une nouvelle fille peut faire basculer son parent (et ses ancêtres).
  if (parentId !== null) {
    await recalcUpwards(projectId, parentId)
  }
  return row
}

/**
 * Met à jour une tâche. 404 si absente ; la tâche doit appartenir au projet de
 * la route, sinon rejet. `parent_id` est revalidé (même projet + anti-cycle),
 * et la règle de statut est réappliquée sur la tâche puis ses ancêtres.
 */
export async function updateTask(
  projectId: string,
  taskId: string,
  input: ProjectTaskUpdateInput,
): Promise<ProjectTaskRow> {
  const found = await db.select().from(projectTasks).where(eq(projectTasks.id, taskId)).limit(1)
  const task = found[0]
  if (!task) notFound('Tâche')
  if (task.project_id !== projectId) badRequest("Cette tâche n'appartient pas à ce projet.")

  const previousParentId = task.parent_id
  const previousIsDone = task.is_done

  let nextParentId = previousParentId
  if (input.parent_id !== undefined && input.parent_id !== previousParentId) {
    await assertValidParent(projectId, input.parent_id, taskId)
    nextParentId = input.parent_id
  }
  const parentChanged = nextParentId !== previousParentId

  const patch: Partial<ProjectTaskRow> = { updated_at: new Date() }
  if (input.title !== undefined) patch.title = input.title
  if (input.is_done !== undefined) patch.is_done = input.is_done
  if (parentChanged) {
    patch.parent_id = nextParentId
    // Changement de fratrie sans position explicite → fin de la nouvelle fratrie.
    if (input.position === undefined) {
      patch.position = await nextSiblingPosition(projectId, nextParentId)
    }
  }
  if (input.position !== undefined) patch.position = input.position

  const updated = await db
    .update(projectTasks)
    .set(patch)
    .where(eq(projectTasks.id, taskId))
    .returning()
  const row = updated[0]
  if (!row) notFound('Tâche')

  const childRows = await db
    .select({ id: projectTasks.id, is_done: projectTasks.is_done })
    .from(projectTasks)
    .where(eq(projectTasks.parent_id, taskId))
  const hasChildren = childRows.length > 0

  // 1. Tâche avec filles : son statut est DÉRIVÉ (écrase la saisie manuelle).
  let currentRow = row
  if (hasChildren) {
    const allDone = childRows.every((child) => child.is_done)
    if (allDone !== currentRow.is_done) {
      const derived = await db
        .update(projectTasks)
        .set({ is_done: allDone, updated_at: new Date() })
        .where(eq(projectTasks.id, taskId))
        .returning()
      const derivedRow = derived[0]
      if (derivedRow) currentRow = derivedRow
    }
  }

  // 2. Remonte la chaîne des parents si le statut final a changé et/ou si la
  //    tâche change de fratrie (les deux parents concernés sont recalculés).
  const statusChanged = currentRow.is_done !== previousIsDone
  if (parentChanged) {
    if (previousParentId !== null) await recalcUpwards(projectId, previousParentId)
    if (nextParentId !== null) await recalcUpwards(projectId, nextParentId)
  } else if (statusChanged && nextParentId !== null) {
    await recalcUpwards(projectId, nextParentId)
  }

  // `currentRow` reflète l'état final (dérivé ou écrit).
  return currentRow
}

/**
 * Supprime une tâche. La tâche doit appartenir au projet de la route. La
 * suppression en cascade DB emporte toute la branche (filles incluses) ; le
 * parent éventuel est recalculé (il a perdu une fille).
 */
export async function deleteTask(projectId: string, taskId: string): Promise<void> {
  const found = await db
    .select({
      id: projectTasks.id,
      project_id: projectTasks.project_id,
      parent_id: projectTasks.parent_id,
    })
    .from(projectTasks)
    .where(eq(projectTasks.id, taskId))
    .limit(1)
  const task = found[0]
  if (!task) notFound('Tâche')
  if (task.project_id !== projectId) notFound('Tâche')
  await db.delete(projectTasks).where(eq(projectTasks.id, taskId))
  if (task.parent_id !== null) {
    await recalcUpwards(projectId, task.parent_id)
  }
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
