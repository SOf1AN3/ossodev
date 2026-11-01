import { readValid, requiredParam, runApi } from '~~/server/utils/http'
import { addTask } from '~~/server/repositories/projectTasks'
import { parseUuidParam, projectTaskCreateSchema } from '~~/server/validation/projects'

/**
 * POST /api/projects/:id/tasks — ajout d'une tâche (404 si projet absent).
 * `parent_id` optionnel : même projet (anti-IDOR) + anti-cycle validés,
 * position en fin de fratrie si absente, statut des parents recalculé.
 */
export default defineEventHandler((event) =>
  runApi(event, async () => {
    const projectId = parseUuidParam(requiredParam(event, 'id'))
    const input = await readValid(projectTaskCreateSchema, event)
    return addTask(projectId, input)
  }),
)
