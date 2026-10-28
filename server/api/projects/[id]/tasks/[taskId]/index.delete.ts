import { requiredParam, runApi } from '~~/server/utils/http'
import { deleteTask } from '~~/server/repositories/projectTasks'
import { parseUuidParam } from '~~/server/validation/projects'

/** DELETE /api/projects/:id/tasks/:taskId — suppression d'une tâche. */
export default defineEventHandler((event) =>
  runApi(event, async () => {
    const projectId = parseUuidParam(requiredParam(event, 'id'))
    const taskId = parseUuidParam(requiredParam(event, 'taskId'))
    await deleteTask(projectId, taskId)
    return { id: taskId }
  }),
)
