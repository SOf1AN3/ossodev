import { defineEventHandler } from 'h3'
import { badRequest, notFound, readValid, requiredParam, runApi, uuidSchema } from '~~/server/utils/http'
import { updateIdea } from '~~/server/repositories/ideas'
import { ideaUpdateSchema } from '~~/server/validation/ideas'

/** PATCH /api/ideas/[id] — update partielle. `description: null` efface la description. */
export default defineEventHandler((event) =>
  runApi(event, async () => {
    const idParam = requiredParam(event, 'id')
    const parsedId = uuidSchema.safeParse(idParam)
    if (!parsedId.success) badRequest('Identifiant invalide.')

    const input = await readValid(ideaUpdateSchema, event)
    const updated = await updateIdea(parsedId.data, input)
    if (updated === null) notFound('Idée')

    return updated
  }),
)
