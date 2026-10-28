/**
 * Repository des projets dev. Toute la logique métier y vit.
 * Drizzle strictement paramétré — aucun SQL brut, aucun accès disque,
 * aucun process shell.
 */
import { and, asc, count, eq, ne, sql } from 'drizzle-orm'
import { db } from '~~/db'
import { projects, projectTasks } from '~~/db/schema'
import { badRequest, notFound } from '~~/server/utils/http'
import type { ProjectCreateInput, ProjectUpdateInput } from '~~/server/validation/projects'

export type ProjectRow = typeof projects.$inferSelect

/** Projet + compteurs agrégés de sa checklist. */
export interface ProjectWithCounts extends ProjectRow {
  task_count: number
  open_tasks: number
  done_tasks: number
}

const PROJECT_COLUMNS = {
  id: projects.id,
  name: projects.name,
  folder_path: projects.folder_path,
  last_scan_at: projects.last_scan_at,
  is_archived: projects.is_archived,
  created_at: projects.created_at,
} as const

/** Agrégation en une seule requête (aucun N+1). */
const COUNT_COLUMNS = {
  task_count: count(projectTasks.id),
  open_tasks: sql<number>`coalesce(sum(case when ${projectTasks.is_done} then 1 else 0 end), 0)`,
  done_tasks: sql<number>`coalesce(sum(case when ${projectTasks.is_done} then 0 else 1 end), 0)`,
} as const

/** Contrainte Postgres générée par `projects.folder_path`.unique(). */
const FOLDER_PATH_UNIQUE = 'projects_folder_path_key'

function isUniqueViolation(e: unknown, constraint: string): boolean {
  const err = e as { code?: unknown; constraint?: unknown }
  return err?.code === '23505' && err?.constraint === constraint
}

function withCounts(
  row: ProjectRow & { task_count: unknown; open_tasks: unknown; done_tasks: unknown },
): ProjectWithCounts {
  return {
    ...row,
    task_count: Number(row.task_count ?? 0),
    open_tasks: Number(row.open_tasks ?? 0),
    done_tasks: Number(row.done_tasks ?? 0),
  }
}

/** Liste des projets triés par nom (asc). Les archivés sont exclus par défaut. */
export async function listProjects(
  options: { includeArchived: boolean },
): Promise<ProjectWithCounts[]> {
  const condition = options.includeArchived
    ? undefined
    : eq(projects.is_archived, false)

  const rows = await db
    .select({ ...PROJECT_COLUMNS, ...COUNT_COLUMNS })
    .from(projects)
    .leftJoin(projectTasks, eq(projectTasks.project_id, projects.id))
    .where(condition)
    .groupBy(projects.id)
    .orderBy(asc(projects.name))

  return rows.map(withCounts)
}

/** Projet + compteurs, ou `null` si absent. */
export async function getProject(id: string): Promise<ProjectWithCounts | null> {
  const rows = await db
    .select({ ...PROJECT_COLUMNS, ...COUNT_COLUMNS })
    .from(projects)
    .leftJoin(projectTasks, eq(projectTasks.project_id, projects.id))
    .where(eq(projects.id, id))
    .groupBy(projects.id)
    .limit(1)

  const row = rows[0]
  return row ? withCounts(row) : null
}

export async function createProject(input: ProjectCreateInput): Promise<ProjectRow> {
  const clash = await db
    .select({ id: projects.id })
    .from(projects)
    .where(and(eq(projects.name, input.name), eq(projects.is_archived, false)))
    .limit(1)
  if (clash.length > 0) badRequest('Un projet du même nom existe déjà.')

  try {
    const rows = await db
      .insert(projects)
      .values({
        name: input.name,
        folder_path: input.folder_path,
        is_archived: input.is_archived,
      })
      .returning()
    const row = rows[0]
    if (!row) badRequest('Création du projet impossible.')
    return row
  } catch (e: unknown) {
    if (isUniqueViolation(e, FOLDER_PATH_UNIQUE)) {
      badRequest('Ce dossier est déjà référencé.')
    }
    throw e
  }
}

export async function updateProject(
  id: string,
  input: ProjectUpdateInput,
): Promise<ProjectRow> {
  const existing = await db
    .select({ id: projects.id, name: projects.name })
    .from(projects)
    .where(eq(projects.id, id))
    .limit(1)
  const current = existing[0]
  if (!current) notFound('Projet')

  if (input.name !== undefined && input.name !== current.name) {
    const clash = await db
      .select({ id: projects.id })
      .from(projects)
      .where(
        and(
          eq(projects.name, input.name),
          eq(projects.is_archived, false),
          ne(projects.id, id),
        ),
      )
      .limit(1)
    if (clash.length > 0) badRequest('Un projet du même nom existe déjà.')
  }

  try {
    const rows = await db
      .update(projects)
      .set(input)
      .where(eq(projects.id, id))
      .returning()
    const row = rows[0]
    if (!row) notFound('Projet')
    return row
  } catch (e: unknown) {
    if (isUniqueViolation(e, FOLDER_PATH_UNIQUE)) {
      badRequest('Ce dossier est déjà référencé.')
    }
    throw e
  }
}

/** Supprime le projet (cascade DB sur ses tâches). */
export async function deleteProject(id: string): Promise<void> {
  const existing = await db
    .select({ id: projects.id })
    .from(projects)
    .where(eq(projects.id, id))
    .limit(1)
  if (existing.length === 0) notFound('Projet')
  await db.delete(projects).where(eq(projects.id, id))
}

/**
 * Upsert par `folder_path` — destiné au scan brain.
 * Si le chemin existe déjà : met à jour `name` et `last_scan_at`
 * sans toucher aux tâches. Sinon : insertion.
 * Inoffensif — aucun side-effect shell, aucune validation dossier.
 */
export async function upsertProjectByPath(
  name: string,
  folderPath: string,
): Promise<ProjectRow> {
  const rows = await db
    .insert(projects)
    .values({ name, folder_path: folderPath })
    .onConflictDoUpdate({
      target: projects.folder_path,
      set: { name, last_scan_at: new Date() },
    })
    .returning()

  const row = rows[0]
  if (!row) badRequest('Enregistrement du projet impossible.')
  return row
}
