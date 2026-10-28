import { defineEventHandler } from 'h3'
import { readValid, runApi } from '~~/server/utils/http'
import { createIdea } from '~~/server/repositories/ideas'
import { ideaCreateSchema } from '~~/server/validation/ideas'

/** POST /api/ideas — création d'une idée (title 1–200 requis, description max 5000). */
export default defineEventHandler((event) =>
  runApi(event, async () => {
    const input = await readValid(ideaCreateSchema, event)
    return createIdea(input)
  }),
)
