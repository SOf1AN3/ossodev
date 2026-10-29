import { notFound, requiredParam, runApi } from '~~/server/utils/http'
import { getCourse } from '~~/server/repositories/learning'

/** GET /api/learning/:technology — cours complet, `content_md` inclus. */
export default defineEventHandler((event) =>
  runApi(event, async () => {
    const technology = requiredParam(event, 'technology')
    const course = await getCourse(technology)
    if (course === null) notFound('Cours')
    return course
  }),
)
