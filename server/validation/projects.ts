/**
 * Validation Zod des projets et de leurs checklists.
 * Validation syntaxique uniquement : aucun accès disque, aucun process shell,
 * aucune résolution de chemin sur le système de fichiers.
 */
import { z } from 'zod'
import { badRequest, uuidSchema } from '~~/server/utils/http'

/** Dossier absolu : Windows (`C:\…` ou `C:/…`) ou Unix (`/…`). */
const WINDOWS_ABSOLUTE = /^[a-zA-Z]:[\\/]/

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
