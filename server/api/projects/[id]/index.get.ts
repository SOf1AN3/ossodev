import { notFound, requiredParam, runApi } from '~~/server/utils/http'
import { getProject } from '~~/server/repositories/projects'
import { parseUuidParam } from '~~/server/validation/projects'

/** GET /api/projects/:id — un projet unique, avec ses compteurs de tâches. */
export default defineEventHandler((event) =>
  runApi(event, async () => {
    const id = parseUuidParam(requiredParam(event, 'id'))
    const project = await getProject(id)
    if (!project) notFound('Projet')
    return project
  }),
)
