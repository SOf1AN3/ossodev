import { runApi } from '~~/server/utils/http'
import { listCoursesWithProjects } from '~~/server/repositories/learning'

/** GET /api/learning — cours enrichis (`last_reviewed_at` + projets liés), `todo` d'abord puis `updated_at` desc. */
export default defineEventHandler((event) =>
  runApi(event, async () => {
    return listCoursesWithProjects()
  }),
)
