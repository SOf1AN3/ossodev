import { defineEventHandler } from 'h3'
import { runApi } from '~~/server/utils/http'
import { getCurrentMission } from '~~/server/services/gamification'

/**
 * GET /api/gamification/missions/current
 * Alias explicite de `GET /api/gamification/missions` (même comportement).
 * Existe pour que le front puisse nommer la route de façon lisible.
 */
export default defineEventHandler((event) =>
  runApi(event, async () => getCurrentMission()),
)
