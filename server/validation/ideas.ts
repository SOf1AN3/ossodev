import { z } from 'zod'

/**
 * Validation des idées (inbox).
 * `title` : 1 à 200 caractères après trim.
 * `description` : facultative, 5 000 caractères max, `null` autorisé (effacement).
 */

export const ideaCreateSchema = z.object({
  title: z.string().trim().min(1, 'Titre requis.').max(200, 'Titre : 200 caractères maximum.'),
  description: z
    .string()
    .max(5000, 'Description : 5 000 caractères maximum.')
    .nullish(),
})
export type IdeaCreateInput = z.infer<typeof ideaCreateSchema>

/** Update partielle : tous les champs sont facultatifs. */
export const ideaUpdateSchema = z.object({
  title: z.string().trim().min(1, 'Titre requis.').max(200, 'Titre : 200 caractères maximum.').optional(),
  description: z
    .string()
    .max(5000, 'Description : 5 000 caractères maximum.')
    .nullish(),
})
export type IdeaUpdateInput = z.infer<typeof ideaUpdateSchema>
