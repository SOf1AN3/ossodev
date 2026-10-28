import { desc, eq } from 'drizzle-orm'
import { ideas } from '~~/db/schema'
import { db } from '~~/db'
import type { Idea } from '~~/shared/types'
import { apiError } from '~~/server/utils/http'
import type { IdeaCreateInput, IdeaUpdateInput } from '~~/server/validation/ideas'

/**
 * Repository de l'inbox d'idées. Toute la logique métier vit ici, jamais dans les routes.
 */

type IdeaRow = typeof ideas.$inferSelect

function mapIdea(row: IdeaRow): Idea {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    created_at: row.created_at.toISOString(),
  }
}

/** Liste des idées, les plus récentes en premier (`created_at` décroissant). */
export async function listIdeas(): Promise<Idea[]> {
  const rows = await db.select().from(ideas).orderBy(desc(ideas.created_at))
  return rows.map(mapIdea)
}

export async function createIdea(input: IdeaCreateInput): Promise<Idea> {
  const rows = await db
    .insert(ideas)
    .values({
      title: input.title,
      description: input.description ?? null,
      // created_at : default DB.
    })
    .returning()

  const row = rows[0]
  if (row === undefined) apiError('INTERNAL', 'Création impossible.', 500)
  return mapIdea(row)
}

/**
 * Update partielle. `description: null` efface la description.
 * Retourne `null` si l'idée n'existe pas (→ 404 côté route).
 */
export async function updateIdea(id: string, input: IdeaUpdateInput): Promise<Idea | null> {
  const values: { title?: string; description?: string | null } = {}
  if (input.title !== undefined) values.title = input.title
  if (input.description !== undefined) values.description = input.description

  const rows = await db
    .update(ideas)
    .set(values)
    .where(eq(ideas.id, id))
    .returning()

  const row = rows[0]
  if (row === undefined) return null
  return mapIdea(row)
}

/** Suppression franche. Retourne l'id supprimé, ou `null` si l'idée n'existe pas. */
export async function deleteIdea(id: string): Promise<string | null> {
  const rows = await db
    .delete(ideas)
    .where(eq(ideas.id, id))
    .returning({ id: ideas.id })

  return rows[0]?.id ?? null
}
