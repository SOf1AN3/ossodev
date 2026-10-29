import { runApi } from '~~/server/utils/http'
import { requireCompanionAuth } from '~~/server/utils/companionAuth'
import { claimPendingCommands } from '~~/server/services/localBridge'

/**
 * POST /api/companion/commands/claim — réclamation atomique des commandes en file.
 * Bearer `COMPANION_SECRET` requis. Reclaim d'abord les `claimed` stale,
 * puis passe en `claimed` toutes les `pending` non expirées (transaction).
 * Ne retourne **jamais** le champ `signature`.
 */
export default defineEventHandler((event) =>
  runApi(event, async () => {
    requireCompanionAuth(event)
    const commands = await claimPendingCommands()
    return { commands }
  }),
)
