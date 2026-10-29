import { z } from 'zod'
import { readValid, runApi } from '~~/server/utils/http'
import { requireCompanionAuth } from '~~/server/utils/companionAuth'
import { ingestBrainScan } from '~~/server/services/localBridge'

const brainResultSchema = z.object({
  dev_root: z.string().trim().min(1, 'Racine du dossier dev requise.').max(400),
  projects: z
    .array(
      z.object({
        name: z.string().trim().min(1, 'Nom de projet requis.').max(120),
        folder_path: z.string().trim().min(1, 'Chemin de dossier requis.').max(400),
      }),
    )
    .max(500),
  errors: z.array(z.string().max(500)).max(200).default([]),
})

/**
 * POST /api/companion/brain-result — résultat du scan renvoyé par le Companion.
 * Bearer requis. Chaque projet est upserté (`upsertProjectByPath`) avec
 * `last_scan_at = now` ; `errors` est validé puis ignoré (déjà remonté au client).
 * → `{ added, updated }`. Zéro lecture de disque côté serveur.
 */
export default defineEventHandler((event) =>
  runApi(event, async () => {
    requireCompanionAuth(event)
    const input = await readValid(brainResultSchema, event)
    return ingestBrainScan({
      dev_root: input.dev_root,
      projects: input.projects,
      errors: input.errors,
    })
  }),
)
