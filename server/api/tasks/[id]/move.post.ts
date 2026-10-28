import { defineEventHandler } from 'h3'
import { badRequest, notFound, readValid, requiredParam, runApi, uuidSchema } from '~~/server/utils/http'
import { moveTask } from '~~/server/repositories/tasks'
import { moveSchema } from '~~/server/validation/tasks'

/**
 * POST /api/tasks/[id]/move — re-planification manuelle
 * (payload `{ scheduled_date: YYYY-MM-DD }`, utile pour sortir un retard).
 */
export default defineEventHandler((event) =>
  runApi(event, async () => {
    const idParam = requiredParam(event, 'id')
    const parsedId = uuidSchema.safeParse(idParam)
    if (!parsedId.success) badRequest('Identifiant invalide.')

    const input = await readValid(moveSchema, event)
    const moved = await moveTask(parsedId.data, input.scheduled_date)
    if (moved === null) notFound('Tâche')

    return moved
  }),
)
