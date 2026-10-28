import { runApi } from '~~/server/utils/http'
import { assertBridgeAllowed } from '~~/server/utils/localBridge'
import { scanDevRoot } from '~~/server/services/brain'

/** POST /api/brain/scan — scan en lecture seule du dossier dev (403 si pont fermé). */
export default defineEventHandler((event) =>
  runApi(event, async () => {
    assertBridgeAllowed()
    return scanDevRoot()
  }),
)
