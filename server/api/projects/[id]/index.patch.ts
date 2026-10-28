import { readValid, requiredParam, runApi } from '~~/server/utils/http'
import { updateProject } from '~~/server/repositories/projects'
import { parseUuidParam, projectUpdateSchema } from '~~/server/validation/projects'

/** PATCH /api/projects/:id — mise à jour partielle d'un projet. */
export default defineEventHandler((event) =>
  runApi(event, async () => {
    const id = parseUuidParam(requiredParam(event, 'id'))
    const input = await readValid(projectUpdateSchema, event)
    return updateProject(id, input)
  }),
)
