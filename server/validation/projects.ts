/**
 * Validation Zod des projets et de leurs checklists.
 *
 * `folder_path` est validé par `assertSafeAbsolutePath` (mécanisme unique du
 * pont local) : allowlist de caractères contre les métacaractères de shell,
 * résolution puis confinement strict sous le dossier dev. C'est une
 * contrainte d'intégrité des données — active même si le pont est désactivé
 * (aucun appel à `assertBridgeAllowed()` ici), aucun accès disque, aucun
 * process shell.
 */
import { z } from 'zod'
import { badRequest, uuidSchema } from '~~/server/utils/http'
import { assertSafeAbsolutePath } from '~~/server/utils/localBridge'

/** Dossier absolu : Windows (`C:\…` ou `C:/…`) ou Unix (`/…`). */
const WINDOWS_ABSOLUTE = /^[a-zA-Z]:[\\/]/

/** Message français par défaut si la cause de refus n'est pas exploitable. */
const FALLBACK_PATH_MESSAGE =
  'Le chemin du projet est refusé : il doit être absolu et se trouver à l’intérieur du dossier dev.'

/** Extrait le message français d'une erreur levée par le pont local. */
function bridgeRejectionMessage(e: unknown): string {
  const err = e as { data?: { error?: { message?: unknown } } }
  const message = err?.data?.error?.message
  return typeof message === 'string' && message.trim().length > 0
    ? message
    : FALLBACK_PATH_MESSAGE
}

export const folderPathSchema = z
  .string()
  .trim()
  .min(5, 'Le chemin du projet doit être absolu.')
  .max(400, 'Le chemin du projet ne peut pas dépasser 400 caractères.')
  .refine(
    (value) => !value.includes('\0'),
    'Le chemin du projet contient un caractère interdit.',
  )
  .refine(
    (value) => WINDOWS_ABSOLUTE.test(value) || value.startsWith('/'),
    'Le chemin du projet doit être absolu.',
  )
  .superRefine((value, ctx) => {
    // Réutilise le mécanisme du pont : allowlist de caractères + résolution
    // + confinement sous `devRootPath`. Aucune logique dupliquée ici.
    try {
      assertSafeAbsolutePath(value)
    } catch (e: unknown) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: bridgeRejectionMessage(e),
      })
    }
  })

export const projectCreateSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, 'Le nom du projet est requis.')
    .max(120, 'Le nom du projet ne peut pas dépasser 120 caractères.'),
  folder_path: folderPathSchema,
  is_archived: z.boolean().default(false),
})

export const projectUpdateSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, 'Le nom du projet est requis.')
    .max(120, 'Le nom du projet ne peut pas dépasser 120 caractères.')
    .optional(),
  folder_path: folderPathSchema.optional(),
  is_archived: z.boolean().optional(),
})

export const projectTaskCreateSchema = z.object({
  title: z
    .string()
    .trim()
    .min(1, 'Le titre de la tâche est requis.')
    .max(300, 'Le titre de la tâche ne peut pas dépasser 300 caractères.'),
  position: z.number().int().min(0, 'La position doit être un entier positif.').optional(),
  is_done: z.boolean().default(false),
})

export const projectTaskUpdateSchema = z.object({
  title: z
    .string()
    .trim()
    .min(1, 'Le titre de la tâche est requis.')
    .max(300, 'Le titre de la tâche ne peut pas dépasser 300 caractères.')
    .optional(),
  position: z.number().int().min(0, 'La position doit être un entier positif.').optional(),
  is_done: z.boolean().optional(),
})

export const reorderSchema = z.object({
  order: z
    .array(uuidSchema)
    .min(1, 'Liste de réordonnancement invalide.'),
})

export type ProjectCreateInput = z.infer<typeof projectCreateSchema>
export type ProjectUpdateInput = z.infer<typeof projectUpdateSchema>
export type ProjectTaskCreateInput = z.infer<typeof projectTaskCreateSchema>
export type ProjectTaskUpdateInput = z.infer<typeof projectTaskUpdateSchema>
export type ReorderInput = z.infer<typeof reorderSchema>

/**
 * Paramètre d'URL de type UUID → 400 normalisé si invalide
 * (évite une erreur Postgres 22P02 et un 500).
 */
export function parseUuidParam(value: string): string {
  const parsed = uuidSchema.safeParse(value)
  if (!parsed.success) badRequest('Identifiant invalide.')
  return parsed.data
}
