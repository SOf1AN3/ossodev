import { runApi, badRequest } from '~~/server/utils/http'
import { enqueueCommand } from '~~/server/services/localBridge'
import { bridgeConfig } from '~~/server/utils/localBridge'

/**
 * POST /api/brain/run — met en file la commande `brain:run`.
 * Aucune commande shell dans le payload : le Companion exécute `brain_command`
 * pris dans **sa propre config** (jamais transmise par le web).
 * `dev_root` absent → 400 en français, jamais de crash.
 */
export default defineEventHandler((event) =>
  runApi(event, async () => {
    const devRoot = bridgeConfig().devRootPath.trim()
    if (devRoot.length === 0) {
      badRequest('Racine du dossier dev non configurée (variable NUXT_DEV_ROOT_PATH).', 'DEV_ROOT_MISSING')
    }
    return enqueueCommand('brain:run', { dev_root: devRoot })
  }),
)
