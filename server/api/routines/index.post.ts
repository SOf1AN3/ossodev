import { defineEventHandler } from 'h3'
import { readValid, runApi } from '~~/server/utils/http'
import { createRoutine } from '~~/server/repositories/routines'
import { routineCreateSchema } from '~~/server/validation/routines'

/**
 * POST /api/routines — création d'un gabarit.
 * L'instance du jour est générée immédiatement si la routine est due aujourd'hui.
 */
export default defineEventHandler((event) =>
  runApi(event, async () => {
    const input = await readValid(routineCreateSchema, event)
    return createRoutine(input)
  }),
)
