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

/**
 * Agrégation en une seule requête (aucun N+1).
 * Comparaisons explicites `= false` / `= true` : sur la ligne NULL produite
 * par la `leftJoin` (projet sans tâche), les deux compteurs valent 0, et
 * `coalesce` couvre le cas `sum` vide. `withCounts` force le type `number`.
 */
const COUNT_COLUMNS = {
  task_count: count(projectTasks.id),
  open_tasks: sql<number>`coalesce(sum(case when ${projectTasks.is_done} = false then 1 else 0 end), 0)`,
  done_tasks: sql<number>`coalesce(sum(case when ${projectTasks.is_done} = true then 1 else 0 end), 0)`,
} as const

/**
 * Contrainte d'unicité réelle de `projects.folder_path` en base.
 * (`name` n'a aucune contrainte unique : son unicité est contrôlée en amont
 * par une lecture explicite.)
 */
const FOLDER_PATH_UNIQUE = 'projects_folder_path_unique'

/** Profondeur max de `error.cause` explorée (Drizzle enveloppe l'erreur PG). */
const MAX_ERROR_CAUSE_DEPTH = 5

/** Message PostgreSQL canonique : nom de contrainte toujours présent. */
const UNIQUE_MESSAGE = /duplicate key value violates unique constraint "([^"]+)"/i

interface SqlErrorShape {
  code?: unknown
  constraint?: unknown
  /** postgres-js nomme la contrainte `constraint_name`. */
  constraint_name?: unknown
  message?: unknown
  cause?: unknown
}

/**
 * Détecte une violation de contrainte d'unicité PostgreSQL (SQLSTATE 23505).
 * Drizzle enveloppe l'erreur driver dans une `DrizzleQueryError` (message
 * « Failed query: … ») dont la cause porte le vrai `code`/`constraint_name` :
 * on descend la chaîne `cause`, et on retombe sur le message (PostgreSQL y
 * inclut toujours le nom de contrainte). Le message d'origine n'est jamais
 * recraché tel quel dans la réponse.
 */
function isUniqueViolation(e: unknown, constraint: string): boolean {
  const seen = new Set<unknown>()
  let current: unknown = e
  for (let depth = 0; depth < MAX_ERROR_CAUSE_DEPTH && current != null; depth += 1) {
    if (typeof current !== 'object' || seen.has(current)) return false
    seen.add(current)
    const err = current as SqlErrorShape
    if (err.code === '23505') {
      const named =
        typeof err.constraint === 'string'
          ? err.constraint
          : typeof err.constraint_name === 'string'
            ? err.constraint_name
            : null
      if (named === constraint) return true
    }
    const match = typeof err.message === 'string' ? UNIQUE_MESSAGE.exec(err.message) : null
    if (match && match[1] === constraint) return true
    current = err.cause
  }
  return false
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
      badRequest('Ce dossier est déjà référencé.', 'DUPLICATE_FOLDER')
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
      badRequest('Ce dossier est déjà référencé.', 'DUPLICATE_FOLDER')
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
