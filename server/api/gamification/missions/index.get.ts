import { defineEventHandler } from 'h3'
import { runApi } from '~~/server/utils/http'
import { getCurrentMission } from '~~/server/services/gamification'

/**
 * GET /api/gamification/missions/current (servi via index.get)
 * Mission de la semaine courante (lundi → dimanche) + progression.
 * `mission: null` si aucune mission cette semaine ; `progress` reste calculé.
 */
export default defineEventHandler((event) =>
  runApi(event, async () => getCurrentMission()),
)
