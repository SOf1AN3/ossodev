import { notFound, requiredParam, runApi } from '~~/server/utils/http'
import { deleteCourse } from '~~/server/repositories/learning'

/** DELETE /api/learning/:technology — suppression du cours (liens projet en cascade DB). */
export default defineEventHandler((event) =>
  runApi(event, async () => {
    const technology = requiredParam(event, 'technology')
    const deleted = await deleteCourse(technology)
    if (!deleted) notFound('Cours')
    return { technology }
  }),
)
