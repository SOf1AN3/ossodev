import { defineEventHandler } from 'h3'
import { badRequest, notFound, requiredParam, runApi, uuidSchema } from '~~/server/utils/http'
import { deleteTask } from '~~/server/repositories/tasks'

/** DELETE /api/tasks/[id] — suppression franche → `{ data: { id } }`. */
export default defineEventHandler((event) =>
  runApi(event, async () => {
    const idParam = requiredParam(event, 'id')
    const parsedId = uuidSchema.safeParse(idParam)
    if (!parsedId.success) badRequest('Identifiant invalide.')

    const deletedId = await deleteTask(parsedId.data)
    if (deletedId === null) notFound('Tâche')

    return { id: deletedId }
  }),
)
