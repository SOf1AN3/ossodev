import { defineEventHandler } from 'h3'
import { badRequest, notFound, readValid, requiredParam, runApi, uuidSchema } from '~~/server/utils/http'
import { updateRoutine } from '~~/server/repositories/routines'
import { routineUpdateSchema } from '~~/server/validation/routines'

/**
 * PATCH /api/routines/[id] — édition du gabarit.
 * Si `frequency`, `weekdays` ou `start_date` change : purge des instances futures
 * non faites puis régénération (plafond 30 jours). L'historique est intouchable.
 */
export default defineEventHandler((event) =>
  runApi(event, async () => {
    const idParam = requiredParam(event, 'id')
    const parsedId = uuidSchema.safeParse(idParam)
    if (!parsedId.success) badRequest('Identifiant invalide.')

    const input = await readValid(routineUpdateSchema, event)
    const result = await updateRoutine(parsedId.data, input)
    if (result === null) notFound('Routine')

    return result.routine
  }),
)
