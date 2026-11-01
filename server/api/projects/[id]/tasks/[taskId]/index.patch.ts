import { readValid, requiredParam, runApi } from '~~/server/utils/http'
import { updateTask } from '~~/server/repositories/projectTasks'
import { parseUuidParam, projectTaskUpdateSchema } from '~~/server/validation/projects'

/**
 * PATCH /api/projects/:id/tasks/:taskId — mise à jour partielle d'une tâche.
 * `is_done` basculé : le statut est recalculé sur toute la chaîne d'ancêtres
 * (règle « toutes les filles done »). `parent_id` revalidé (même projet +
 * anti-cycle).
 */
export default defineEventHandler((event) =>
  runApi(event, async () => {
    const projectId = parseUuidParam(requiredParam(event, 'id'))
    const taskId = parseUuidParam(requiredParam(event, 'taskId'))
    const input = await readValid(projectTaskUpdateSchema, event)
    return updateTask(projectId, taskId, input)
  }),
)
