import { defineEventHandler } from 'h3'
import { runApi } from '~~/server/utils/http'
import { listRoutines } from '~~/server/repositories/routines'

/** GET /api/routines — toutes les routines triées par titre, avec `next_dates` (5 prochaines). */
export default defineEventHandler((event) =>
  runApi(event, async () => {
    return listRoutines()
  }),
)
