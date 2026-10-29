import { z } from 'zod'
import { eq } from 'drizzle-orm'
import { db } from '~~/db'
import { companionCommands } from '~~/db/schema'
import {
  apiError,
  badRequest,
  notFound,
  readValid,
  requiredParam,
  runApi,
  uuidSchema,
} from '~~/server/utils/http'
import { requireCompanionAuth } from '~~/server/utils/companionAuth'

const completeSchema = z.object({
  status: z.enum(['done', 'failed'], {
    errorMap: () => ({ message: 'Le statut doit être « done » ou « failed ».' }),
  }),
  result_text: z.string().trim().max(10_000).optional(),
})

/**
 * POST /api/companion/commands/:id/complete — clôture d'une commande.
 * Bearer requis · 404 si inconnue · 409 si déjà `done`/`failed`.
 * `executed_at` est posé à `now` sur la clôture.
 */
export default defineEventHandler((event) =>
  runApi(event, async () => {
    requireCompanionAuth(event)

    const rawId = requiredParam(event, 'id')
    const parsedId = uuidSchema.safeParse(rawId)
    if (!parsedId.success) badRequest('Identifiant de commande invalide.')
    const id = parsedId.data

    const input = await readValid(completeSchema, event)

    const existing = await db
      .select({ id: companionCommands.id, status: companionCommands.status })
      .from(companionCommands)
      .where(eq(companionCommands.id, id))
      .limit(1)
    const current = existing[0]
    if (!current) notFound('Commande')
    if (current.status === 'done' || current.status === 'failed') {
      apiError('COMMAND_ALREADY_COMPLETED', 'Commande déjà clôturée.', 409)
    }

    const rows = await db
      .update(companionCommands)
      .set({
        status: input.status,
        result_text: input.result_text ?? null,
        executed_at: new Date(),
      })
      .where(eq(companionCommands.id, id))
      .returning({ id: companionCommands.id, status: companionCommands.status })

    const updated = rows[0]
    if (!updated) notFound('Commande')

    return { id: updated.id, status: updated.status }
  }),
)
