import { defineEventHandler } from 'h3'
import { runApi } from '~~/server/utils/http'
import { assertBridgeAllowed } from '~~/server/utils/localBridge'
import { runBrainCommand } from '~~/server/services/brain'

/**
 * POST /api/brain/run — exécute la commande `brain` configurée dans Réglages,
 * avec pour dossier courant la racine dev.
 *
 * Contrairement à la plupart des routes, celle-ci **ne doit jamais renvoyer un 500
 * opaque** : que la commande soit absente, qu'elle échoue ou qu'elle réussisse,
 * tout est sérialisé dans `data` pour être affiché proprement dans l'UI.
 * Seul un pont indisponible (Vercel, hors localhost) renvoie une 403.
 */
export default defineEventHandler((event) =>
  runApi(event, async () => {
    assertBridgeAllowed()
    return runBrainCommand()
  }),
)
