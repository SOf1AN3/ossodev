/**
 * Repository des cours d'apprentissage (piste B) : UNE ligne par technologie.
 * Toute la logique métier y vit, jamais dans les routes.
 * Drizzle strictement paramétré — aucun SQL brut, aucune valeur utilisateur
 * injectée dans le SQL.
 */
import { and, desc, eq, notInArray, sql } from 'drizzle-orm'
import { db } from '~~/db'
import { learningCourses, projectTechnologies, projects } from '~~/db/schema'
import { apiError } from '~~/server/utils/http'
import type {
  CourseWithProjects,
  LearningCourse,
  LearningCourseSummary,
  LearningStatus,
} from '~~/shared/types'
import type { LearningCourseCreateInput, LearningStatusInput } from '~~/server/validation/learning'

type LearningCourseRow = typeof learningCourses.$inferSelect

/** Résumé de liste : `content_md` volontairement exclu (trop lourd). */
type SummaryRow = Pick<
  LearningCourseRow,
  'technology' | 'title' | 'status' | 'created_at' | 'updated_at' | 'completed_at'
>

/** Statut brut DB → statut du contrat partagé (le CHECK DB garantit l'égalité). */
function mapStatus(status: string): LearningStatus {
  return status === 'done' ? 'done' : 'todo'
}

function mapSummary(row: SummaryRow): LearningCourseSummary {
  return {
    technology: row.technology,
    title: row.title,
    status: mapStatus(row.status),
    created_at: row.created_at.toISOString(),
    updated_at: row.updated_at.toISOString(),
    completed_at: row.completed_at === null ? null : row.completed_at.toISOString(),
  }
}

function mapCourse(row: LearningCourseRow): LearningCourse {
  return { ...mapSummary(row), content_md: row.content_md }
}

/**
 * Liste complète des cours enrichie : `last_reviewed_at` + les projets qui
 * l'utilisent (détection brain via `project_technologies`), au format
 * `CourseWithProjects`. `content_md` exclu.
 * Tri : statut `todo` d'abord, puis `updated_at` décroissant.
 */
export async function listCoursesWithProjects(): Promise<CourseWithProjects[]> {
  const rows = await db
    .select({
      technology: learningCourses.technology,
      title: learningCourses.title,
      status: learningCourses.status,
      last_reviewed_at: learningCourses.last_reviewed_at,
      project_id: projectTechnologies.project_id,
      project_name: projects.name,
      project_folder_path: projects.folder_path,
    })
    .from(learningCourses)
    .leftJoin(projectTechnologies, eq(projectTechnologies.technology, learningCourses.technology))
    .leftJoin(projects, eq(projects.id, projectTechnologies.project_id))
    .orderBy(
      sql`case when ${learningCourses.status} = 'todo' then 0 else 1 end`,
      desc(learningCourses.updated_at),
    )

  const byTechnology = new Map<string, CourseWithProjects>()
  for (const row of rows) {
    let course = byTechnology.get(row.technology)
    if (!course) {
      course = {
        technology: row.technology,
        title: row.title,
        status: mapStatus(row.status),
        last_reviewed_at: row.last_reviewed_at === null ? null : row.last_reviewed_at.toISOString(),
        projects: [],
      }
      byTechnology.set(row.technology, course)
    }
    // leftJoin : les colonnes projet sont NULL si le cours n'a aucun lien.
    if (row.project_id !== null && row.project_name !== null && row.project_folder_path !== null) {
      course.projects.push({
        id: row.project_id,
        name: row.project_name,
        folder_path: row.project_folder_path,
      })
    }
  }
  return [...byTechnology.values()]
}

/** Cours complet (avec `content_md`), ou `null` si absent. */
export async function getCourse(technology: string): Promise<LearningCourse | null> {
  const rows = await db
    .select()
    .from(learningCourses)
    .where(eq(learningCourses.technology, technology))
    .limit(1)

  const row = rows[0]
  return row === undefined ? null : mapCourse(row)
}

/**
 * Upsert sur `technology` (contrainte unique `uniq_learning_technology`) :
 * - création → `status = 'todo'`, `completed_at = null` (défauts DB) ;
 * - réédition → seuls `title`, `content_md` et `updated_at` sont réécrits :
 *   `status`, `completed_at` et `last_reviewed_at` sont CONSERVÉS
 *   (réédition d'un cours Accompli = toujours Accompli).
 */
export async function upsertCourse(input: LearningCourseCreateInput): Promise<LearningCourse> {
  const now = new Date()
  const rows = await db
    .insert(learningCourses)
    .values({
      technology: input.technology,
      title: input.title,
      content_md: input.content_md,
      updated_at: now,
    })
    .onConflictDoUpdate({
      target: learningCourses.technology,
      set: { title: input.title, content_md: input.content_md, updated_at: now },
    })
    .returning()

  const row = rows[0]
  if (row === undefined) apiError('INTERNAL', 'Enregistrement du cours impossible.', 500)
  return mapCourse(row)
}

/** Résultat de la bascule de statut. */
export interface LearningStatusResult {
  technology: string
  status: LearningStatus
  /** ISO 8601 — posé à la bascule `done`, vidé au retour `todo`. */
  completed_at: string | null
}

/**
 * Bascule todo ⇄ done : `done` pose `completed_at = now`,
 * `todo` remet `completed_at` à `null`.
 * Retourne `null` si le cours n'existe pas (→ 404 côté route).
 */
export async function setStatus(
  technology: string,
  status: LearningStatusInput,
): Promise<LearningStatusResult | null> {
  const rows = await db
    .update(learningCourses)
    .set({
      status,
      completed_at: status === 'done' ? new Date() : null,
    })
    .where(eq(learningCourses.technology, technology))
    .returning({
      technology: learningCourses.technology,
      status: learningCourses.status,
      completed_at: learningCourses.completed_at,
    })

  const row = rows[0]
  if (row === undefined) return null
  return {
    technology: row.technology,
    status: mapStatus(row.status),
    completed_at: row.completed_at === null ? null : row.completed_at.toISOString(),
  }
}

/**
 * Pose `last_reviewed_at = now()` (relecture manuelle du cours).
 * Retourne `false` si le cours n'existe pas (→ 404 côté route).
 */
export async function reviewCourse(technology: string): Promise<boolean> {
  const rows = await db
    .update(learningCourses)
    .set({ last_reviewed_at: new Date() })
    .where(eq(learningCourses.technology, technology))
    .returning({ technology: learningCourses.technology })
  return rows.length > 0
}

/**
 * Supprime un cours. Les liens `project_technologies` partent en cascade DB
 * (FK `onDelete: cascade`) — aucune purge manuelle.
 * Retourne `false` si le cours n'existait pas (→ 404 côté route).
 */
export async function deleteCourse(technology: string): Promise<boolean> {
  const rows = await db
    .delete(learningCourses)
    .where(eq(learningCourses.technology, technology))
    .returning({ technology: learningCourses.technology })
  return rows.length > 0
}

/**
 * Remplace les liens `project_technologies` des projets d'un scan Companion :
 * - les technologies inconnues de `learning_courses` sont ignorées
 *   silencieusement (jamais d'insertion orpheline) ;
 * - les liens déjà présents sont conservés (`onConflictDoNothing`) ;
 * - les liens absents du scan sont purgés — un scan corrigé reflète la
 *   réalité, pas un cumul.
 * `folder_path` inconnu → projet ignoré (ne devrait pas arriver après
 * `ingestBrainScan`).
 */
export async function replaceScanTechnologies(
  items: Array<{ folder_path: string; technologies: string[] }>,
): Promise<void> {
  if (items.length === 0) return

  const knownRows = await db
    .select({ technology: learningCourses.technology })
    .from(learningCourses)
  const known = new Set(knownRows.map((row) => row.technology))

  for (const item of items) {
    const projectRows = await db
      .select({ id: projects.id })
      .from(projects)
      .where(eq(projects.folder_path, item.folder_path))
      .limit(1)
    const project = projectRows[0]
    if (!project) continue

    const wanted = [...new Set(item.technologies)].filter((technology) => known.has(technology))
    if (wanted.length === 0) {
      await db.delete(projectTechnologies).where(eq(projectTechnologies.project_id, project.id))
      continue
    }

    await db.transaction(async (tx) => {
      await tx
        .insert(projectTechnologies)
        .values(wanted.map((technology) => ({ project_id: project.id, technology })))
        .onConflictDoNothing({
          target: [projectTechnologies.project_id, projectTechnologies.technology],
        })
      await tx
        .delete(projectTechnologies)
        .where(
          and(
            eq(projectTechnologies.project_id, project.id),
            notInArray(projectTechnologies.technology, wanted),
          ),
        )
    })
  }
}
