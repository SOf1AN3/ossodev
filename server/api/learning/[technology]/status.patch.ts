import { notFound, readValid, requiredParam, runApi } from '~~/server/utils/http'
import { setStatus } from '~~/server/repositories/learning'
import { learningStatusSchema } from '~~/server/validation/learning'

/** PATCH /api/learning/:technology/status — bascule todo ⇄ done (`completed_at` posé/vide). */
export default defineEventHandler((event) =>
  runApi(event, async () => {
    const technology = requiredParam(event, 'technology')
    const input = await readValid(learningStatusSchema, event)
    const result = await setStatus(technology, input.status)
    if (result === null) notFound('Cours')
    return result
  }),
)
