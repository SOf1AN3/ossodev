import { readValid, runApi } from '~~/server/utils/http'
import { createProject } from '~~/server/repositories/projects'
import { projectCreateSchema } from '~~/server/validation/projects'

/** POST /api/projects — création manuelle d'un projet. */
export default defineEventHandler((event) =>
  runApi(event, async () => {
    const input = await readValid(projectCreateSchema, event)
    return createProject(input)
  }),
)
