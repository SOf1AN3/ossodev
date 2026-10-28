import { defineEventHandler } from 'h3'
import { badRequest, notFound, requiredParam, runApi, uuidSchema } from '~~/server/utils/http'
import { deleteIdea } from '~~/server/repositories/ideas'

/** DELETE /api/ideas/[id] — suppression franche → `{ data: { id } }`. */
export default defineEventHandler((event) =>
  runApi(event, async () => {
    const idParam = requiredParam(event, 'id')
    const parsedId = uuidSchema.safeParse(idParam)
    if (!parsedId.success) badRequest('Identifiant invalide.')

    const deletedId = await deleteIdea(parsedId.data)
    if (deletedId === null) notFound('Idée')

    return { id: deletedId }
  }),
)
