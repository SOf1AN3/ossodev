import { defineEventHandler } from 'h3'
import { badRequest, notFound, readValid, requiredParam, runApi, uuidSchema } from '~~/server/utils/http'
import { updateTask } from '~~/server/repositories/tasks'
import { taskUpdateSchema } from '~~/server/validation/tasks'

/**
 * PATCH /api/tasks/[id] — update partielle.
 * Si `status` est fourni : `done` → `completed_at` = maintenant, sinon `completed_at` = null.
 */
export default defineEventHandler((event) =>
  runApi(event, async () => {
    const idParam = requiredParam(event, 'id')
    const parsedId = uuidSchema.safeParse(idParam)
    if (!parsedId.success) badRequest('Identifiant invalide.')

    const input = await readValid(taskUpdateSchema, event)
    const updated = await updateTask(parsedId.data, input)
    if (updated === null) notFound('Tâche')

    return updated
  }),
)
