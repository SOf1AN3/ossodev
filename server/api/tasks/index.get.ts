import { defineEventHandler, getQuery } from 'h3'
import { badRequest, runApi } from '~~/server/utils/http'
import { listTasks } from '~~/server/repositories/tasks'
import { taskListQuerySchema } from '~~/server/validation/tasks'

/**
 * GET /api/tasks
 * Query facultative : `view=today` | `from=YYYY-MM-DD` | `to=YYYY-MM-DD` | `status=`.
 * - sans paramètre ou `view=today` : tâches du jour + retards (marqueur `is_overdue`) ;
 * - `from`/`to` : instances générées pour chaque jour de l'intervalle (plafond 60 jours).
 */
export default defineEventHandler((event) =>
  runApi(event, async () => {
    const raw = getQuery(event)
    const parsed = taskListQuerySchema.safeParse({
      view: raw.view,
      from: raw.from,
      to: raw.to,
      status: raw.status,
    })
    if (!parsed.success) {
      const issue = parsed.error.issues[0]
      if (!issue) badRequest('Paramètres de requête invalides.', 'VALIDATION')
      badRequest(`${issue.path.join('.') || 'query'} : ${issue.message}`, 'VALIDATION')
    }

    return listTasks(parsed.data)
  }),
)
