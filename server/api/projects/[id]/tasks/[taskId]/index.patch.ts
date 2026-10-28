import { readValid, requiredParam, runApi } from '~~/server/utils/http'
import { updateTask } from '~~/server/repositories/projectTasks'
import { parseUuidParam, projectTaskUpdateSchema } from '~~/server/validation/projects'

/** PATCH /api/projects/:id/tasks/:taskId — mise à jour partielle d'une tâche. */
export default defineEventHandler((event) =>
  runApi(event, async () => {
    const projectId = parseUuidParam(requiredParam(event, 'id'))
    const taskId = parseUuidParam(requiredParam(event, 'taskId'))
    const input = await readValid(projectTaskUpdateSchema, event)
    return updateTask(projectId, taskId, input)
  }),
)
