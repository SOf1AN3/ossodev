import { requiredParam, runApi } from '~~/server/utils/http'
import { deleteProject } from '~~/server/repositories/projects'
import { parseUuidParam } from '~~/server/validation/projects'

/** DELETE /api/projects/:id — suppression du projet (cascade sur ses tâches). */
export default defineEventHandler((event) =>
  runApi(event, async () => {
    const id = parseUuidParam(requiredParam(event, 'id'))
    await deleteProject(id)
    return { id }
  }),
)
