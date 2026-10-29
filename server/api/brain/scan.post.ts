import { runApi, badRequest } from '~~/server/utils/http'
import { enqueueCommand } from '~~/server/services/localBridge'
import { bridgeConfig } from '~~/server/utils/localBridge'

/**
 * POST /api/brain/scan — met en file la commande `brain:scan`.
 * Le serveur **ne lit plus le disque** : le Companion scanne `dev_root` et
 * renvoie le résultat via `POST /api/companion/brain-result`.
 * `dev_root` absent → 400 en français, jamais de crash.
 */
export default defineEventHandler((event) =>
  runApi(event, async () => {
    const devRoot = bridgeConfig().devRootPath.trim()
    if (devRoot.length === 0) {
      badRequest('Racine du dossier dev non configurée (variable NUXT_DEV_ROOT_PATH).', 'DEV_ROOT_MISSING')
    }
    return enqueueCommand('brain:scan', { dev_root: devRoot })
  }),
)
