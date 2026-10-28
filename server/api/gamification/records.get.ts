import { defineEventHandler } from 'h3'
import { runApi } from '~~/server/utils/http'
import { getRecords } from '~~/server/services/gamification'

/** GET /api/gamification/records — records personnels (meilleur streak, jour, semaine…). */
export default defineEventHandler((event) =>
  runApi(event, async () => getRecords()),
)
