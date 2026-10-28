import { runApi } from '~~/server/utils/http'
import { isBridgeAvailable } from '~~/server/utils/localBridge'

/** GET /api/bridge/status — statut public du pont local (aucun processus lancé). */
export default defineEventHandler((event) =>
  runApi(event, async () => isBridgeAvailable()),
)
