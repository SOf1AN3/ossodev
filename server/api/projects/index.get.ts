import { optionalQuery, runApi } from '~~/server/utils/http'
import { listProjects } from '~~/server/repositories/projects'

/** GET /api/projects — liste triée par nom ; les archivés sont exclus par défaut. */
export default defineEventHandler((event) =>
  runApi(event, async () => {
    const includeArchived = optionalQuery(event, 'includeArchived') === 'true'
    return listProjects({ includeArchived })
  }),
)
