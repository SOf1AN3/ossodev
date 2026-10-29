/**
 * Repository des cours d'apprentissage (piste B) : UNE ligne par technologie.
 * Toute la logique métier y vit, jamais dans les routes.
 * Drizzle strictement paramétré — aucun SQL brut, aucune valeur utilisateur
 * injectée dans le SQL.
 */
import { desc, eq, sql } from 'drizzle-orm'
import { db } from '~~/db'
import { learningCourses } from '~~/db/schema'
import { apiError } from '~~/server/utils/http'
import type { LearningCourse, LearningCourseSummary, LearningStatus } from '~~/shared/types'
import type { LearningCourseCreateInput, LearningStatusInput } from '~~/server/validation/learning'

type LearningCourseRow = typeof learningCourses.$inferSelect

/** Résumé de liste : `content_md` volontairement exclu (trop lourd). */
type SummaryRow = Pick<
  LearningCourseRow,
  'technology' | 'title' | 'status' | 'created_at' | 'updated_at' | 'completed_at'
>

const SUMMARY_COLUMNS = {
  technology: learningCourses.technology,
  title: learningCourses.title,
  status: learningCourses.status,
  created_at: learningCourses.created_at,
  updated_at: learningCourses.updated_at,
  completed_at: learningCourses.completed_at,
} as const

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
 * Liste complète des résumés, SANS `content_md`.
 * Tri : statut `todo` d'abord, puis `updated_at` décroissant.
 */
export async function listCourses(): Promise<LearningCourseSummary[]> {
  const rows = await db
    .select(SUMMARY_COLUMNS)
    .from(learningCourses)
    .orderBy(
      sql`case when ${learningCourses.status} = 'todo' then 0 else 1 end`,
      desc(learningCourses.updated_at),
    )
  return rows.map(mapSummary)
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
 *   `status` et `completed_at` sont CONSERVÉS (réédition d'un cours Accompli
 *   = toujours Accompli).
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
