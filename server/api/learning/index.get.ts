import { runApi } from '~~/server/utils/http'
import { listCourses } from '~~/server/repositories/learning'

/** GET /api/learning — résumés SANS `content_md`, `todo` d'abord puis `updated_at` desc. */
export default defineEventHandler((event) =>
  runApi(event, async () => {
    return listCourses()
  }),
)
