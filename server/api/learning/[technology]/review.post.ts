import { notFound, requiredParam, runApi } from '~~/server/utils/http'
import { reviewCourse } from '~~/server/repositories/learning'

/** POST /api/learning/:technology/review — pose `last_reviewed_at = now()`. */
export default defineEventHandler((event) =>
  runApi(event, async () => {
    const technology = requiredParam(event, 'technology')
    const reviewed = await reviewCourse(technology)
    if (!reviewed) notFound('Cours')
    return { ok: true as const }
  }),
)
