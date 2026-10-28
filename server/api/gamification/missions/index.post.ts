import { defineEventHandler } from 'h3'
import { readValid, runApi } from '~~/server/utils/http'
import { createMission } from '~~/server/services/gamification'
import { missionCreateSchema } from '~~/server/validation/missions'

/**
 * POST /api/gamification/missions — crée la mission de la semaine courante.
 * `week_start` est calculé côté serveur (lundi de la semaine courante).
 * 400 si une mission existe déjà cette semaine.
 */
export default defineEventHandler((event) =>
  runApi(event, async () => {
    const input = await readValid(missionCreateSchema, event)
    return createMission(input)
  }),
)
