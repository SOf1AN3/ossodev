import { z } from 'zod'
import { readValid, runApi } from '~~/server/utils/http'
import { requireCompanionAuth } from '~~/server/utils/companionAuth'
import { recordHeartbeat } from '~~/server/services/localBridge'

const heartbeatSchema = z
  .object({
    app_version: z.string().trim().min(1).max(40).optional(),
  })
  .default({})

/**
 * POST /api/companion/heartbeat — upsert de `companion_presence` (`id='local'`).
 * Bearer requis. Corps facultatif (`app_version` seulement) → `{ lastSeenAt }`.
 */
export default defineEventHandler((event) =>
  runApi(event, async () => {
    requireCompanionAuth(event)
    const input = await readValid(heartbeatSchema, event)
    return recordHeartbeat(input.app_version)
  }),
)
