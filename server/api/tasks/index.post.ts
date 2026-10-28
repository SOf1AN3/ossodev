import { defineEventHandler } from 'h3'
import { readValid, runApi } from '~~/server/utils/http'
import { createTask } from '~~/server/repositories/tasks'
import { taskCreateSchema } from '~~/server/validation/tasks'

/** POST /api/tasks — création d'une tâche one-off (validée par `taskCreateSchema`). */
export default defineEventHandler((event) =>
  runApi(event, async () => {
    const input = await readValid(taskCreateSchema, event)
    return createTask(input)
  }),
)
