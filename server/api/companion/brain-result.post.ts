import { z } from 'zod'
import { readValid, runApi } from '~~/server/utils/http'
import { requireCompanionAuth } from '~~/server/utils/companionAuth'
import { ingestBrainScan } from '~~/server/services/localBridge'
import { replaceScanTechnologies } from '~~/server/repositories/learning'

const brainResultSchema = z.object({
  dev_root: z.string().trim().min(1, 'Racine du dossier dev requise.').max(400),
  projects: z
    .array(
      z.object({
        name: z.string().trim().min(1, 'Nom de projet requis.').max(120),
        folder_path: z.string().trim().min(1, 'Chemin de dossier requis.').max(400),
        technologies: z.array(z.string().trim().min(1).max(80)).max(100).default([]),
      }),
    )
    .max(500),
  errors: z.array(z.string().max(500)).max(200).default([]),
})

/**
 * POST /api/companion/brain-result — résultat du scan renvoyé par le Companion.
 * Bearer requis. Chaque projet est upserté (`upsertProjectByPath`) avec
 * `last_scan_at = now` ; les `technologies` détectées remplacent ensuite les
 * liens `project_technologies` (upsert + purge des absents ; les technologies
 * inconnues de `learning_courses` sont ignorées silencieusement).
 * `errors` est validé puis ignoré (déjà remonté au client).
 * → `{ added, updated }`. Zéro lecture de disque côté serveur.
 */
export default defineEventHandler((event) =>
  runApi(event, async () => {
    requireCompanionAuth(event)
    const input = await readValid(brainResultSchema, event)
    const result = await ingestBrainScan({
      dev_root: input.dev_root,
      projects: input.projects,
      errors: input.errors,
    })
    await replaceScanTechnologies(
      input.projects.map((project) => ({
        folder_path: project.folder_path,
        technologies: project.technologies,
      })),
    )
    return result
  }),
)
