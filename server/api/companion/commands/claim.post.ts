import { runApi } from '~~/server/utils/http'
import { requireCompanionAuth } from '~~/server/utils/companionAuth'
import { claimPendingCommands } from '~~/server/services/localBridge'

/**
 * POST /api/companion/commands/claim — réclamation atomique des commandes en file.
 * Bearer `COMPANION_SECRET` requis. Reclaim d'abord les `claimed` stale,
 * puis passe en `claimed` toutes les `pending` non expirées (transaction).
 *
 * Chaque commande renvoie `signature` + `expires_at` : le Companion vérifie le
 * HMAC **avant** exécution. Sans cela, une ligne forgée directement en base
 * serait exécutée — le HMAC est la défense, et il ne divulgue pas la clé.
 */
export default defineEventHandler((event) =>
  runApi(event, async () => {
    requireCompanionAuth(event)
    const commands = await claimPendingCommands()
    return { commands }
  }),
)
