import { requiredParam, runApi } from '~~/server/utils/http'
import { listTaskTree } from '~~/server/repositories/projectTasks'
import { parseUuidParam } from '~~/server/validation/projects'

/** GET /api/projects/:id/tasks — arbre complet de la checklist (racines + children imbriqués). */
export default defineEventHandler((event) =>
  runApi(event, async () => {
    const projectId = parseUuidParam(requiredParam(event, 'id'))
    return listTaskTree(projectId)
  }),
)
