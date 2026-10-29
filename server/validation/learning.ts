/**
 * Validation Zod des cours d'apprentissage (piste B).
 *
 * L'assainissement se fait en ENTRÉE : le contenu doit être structuré
 * (sections `## `, bloc ` ```mermaid `) et ne doit jamais embarquer de
 * script ni d'attribut d'événement HTML. Le dashboard assainit aussi en
 * sortie (DOMPurify) — les deux défenses sont nécessaires.
 */
import { z } from 'zod'

/** Slug de technologie : minuscules, chiffres, tirets — 2 à 41 caractères. */
const TECHNOLOGY_SLUG = /^[a-z0-9][a-z0-9-]{1,40}$/

/** Signatures interdites : balise script, pseudo-URL javascript, attribut d'événement HTML. */
const FORBIDDEN_CONTENT = [/<script/i, /javascript:/i, /on\w+=/i] as const

/** Le cours doit être structuré en sections Markdown. */
const SECTION_MARKER = '## '

/** Chaque cours doit contenir au moins un diagramme Mermaid. */
const MERMAID_MARKER = '```mermaid'

export const technologySchema = z
  .string()
  .trim()
  .regex(
    TECHNOLOGY_SLUG,
    'Slug de technologie invalide : minuscules, chiffres et tirets uniquement (2 à 41 caractères).',
  )

export const titleSchema = z
  .string()
  .trim()
  .min(1, 'Le titre du cours est requis.')
  .max(120, 'Le titre du cours ne peut pas dépasser 120 caractères.')

const contentMdSchema = z
  .string()
  .min(500, 'Le contenu du cours doit contenir au moins 500 caractères.')
  .max(200_000, 'Le contenu du cours ne peut pas dépasser 200 000 caractères.')
  .superRefine((value, ctx) => {
    // Sécurité d'abord : on ne descend pas plus bas si le contenu est refusé.
    if (FORBIDDEN_CONTENT.some((pattern) => pattern.test(value))) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Contenu refusé : balise ou script détecté.',
      })
      return
    }
    if (value.includes(SECTION_MARKER) === false) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Le cours doit contenir des sections (## …).',
      })
      return
    }
    if (value.includes(MERMAID_MARKER) === false) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Ajoute au moins un diagramme Mermaid.',
      })
    }
  })

/** Corps de POST /api/learning — création ou réédition (upsert) d'un cours. */
export const learningCourseCreateSchema = z.object({
  technology: technologySchema,
  title: titleSchema,
  content_md: contentMdSchema,
})

/** Corps de PATCH /api/learning/:technology/status — bascule todo ⇄ done. */
export const learningStatusSchema = z.object({
  status: z.enum(['todo', 'done'], {
    errorMap: () => ({ message: 'Le statut doit être « todo » ou « done ».' }),
  }),
})

export type LearningCourseCreateInput = z.infer<typeof learningCourseCreateSchema>
export type LearningStatusInput = z.infer<typeof learningStatusSchema>['status']
