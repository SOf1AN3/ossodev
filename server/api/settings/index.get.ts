import { runApi } from '~~/server/utils/http'
import { getSettings } from '~~/server/repositories/settings'

/** GET /api/settings — réglages courants (repli sur les défauts inclus). */
export default defineEventHandler((event) =>
  runApi(event, async () => getSettings()),
)
