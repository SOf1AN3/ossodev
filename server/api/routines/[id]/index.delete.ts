import { defineEventHandler } from 'h3'
import { badRequest, notFound, requiredParam, runApi, uuidSchema } from '~~/server/utils/http'
import { deleteRoutine } from '~~/server/repositories/routines'

/**
 * DELETE /api/routines/[id] — suppression du gabarit.
 * Purge les seules instances futures non faites ; les instances passées ou
 * déjà faites sont conservées (historique, `routine_id` → NULL).
 */
export default defineEventHandler((event) =>
  runApi(event, async () => {
    const idParam = requiredParam(event, 'id')
    const parsedId = uuidSchema.safeParse(idParam)
    if (!parsedId.success) badRequest('Identifiant invalide.')

    const deleted = await deleteRoutine(parsedId.data)
    if (deleted === null) notFound('Routine')

    return { id: deleted.id }
  }),
)
