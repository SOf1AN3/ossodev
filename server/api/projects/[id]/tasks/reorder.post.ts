import { readValid, requiredParam, runApi } from '~~/server/utils/http'
import { reorderTasks } from '~~/server/repositories/projectTasks'
import { parseUuidParam, reorderSchema } from '~~/server/validation/projects'

/** POST /api/projects/:id/tasks/reorder — réordonnancement transactionnel. */
export default defineEventHandler((event) =>
  runApi(event, async () => {
    const projectId = parseUuidParam(requiredParam(event, 'id'))
    const { order } = await readValid(reorderSchema, event)
    await reorderTasks(projectId, order)
    return { projectId, order }
  }),
)
