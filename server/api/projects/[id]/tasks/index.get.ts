import { requiredParam, runApi } from '~~/server/utils/http'
import { listTasks } from '~~/server/repositories/projectTasks'
import { parseUuidParam } from '~~/server/validation/projects'

/** GET /api/projects/:id/tasks — checklist complète triée. */
export default defineEventHandler((event) =>
  runApi(event, async () => {
    const projectId = parseUuidParam(requiredParam(event, 'id'))
    return listTasks(projectId)
  }),
)
