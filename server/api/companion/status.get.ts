import { runApi } from '~~/server/utils/http'
import { getCompanionStatus } from '~~/server/services/localBridge'

/**
 * GET /api/companion/status — pastille de présence (publique, aucune donnée sensible).
 * `available = now − last_seen_at < 45 s` ; jamais de ligne → Companion non démarré.
 */
export default defineEventHandler((event) =>
  runApi(event, async () => getCompanionStatus()),
)
