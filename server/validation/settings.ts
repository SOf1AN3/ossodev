/**
 * Validation Zod des réglages OSSO.
 * Rejet systématique des caractères de contrôle : une commande contenant
 * un caractère de contrôle ne doit jamais atteindre un process.
 */
import { z } from 'zod'

/** NUL, ESC, etc. — interdit partout, y compris dans les modèles multi-lignes. */
const FORBIDDEN_CONTROL = /[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/
/** Commandes sur une seule ligne : aucun retour ni tabulation admis. */
const FORBIDDEN_CONTROL_ONE_LINE = /[\x00-\x1f\x7f]/

const CONTROL_MESSAGE = 'Caractère de contrôle interdit.'

export const settingsUpdateSchema = z.object({
  // Le gabarit est multi-ligne : \n, \r et \t sont légitimes (sauts de ligne du prompt).
  leadIntroTemplate: z
    .string({
      invalid_type_error: 'Valeur textuelle attendue.',
    })
    .max(100_000, 'Le modèle de prompt ne peut pas dépasser 100 000 caractères.')
    .refine((value) => !FORBIDDEN_CONTROL.test(value), CONTROL_MESSAGE)
    .optional(),
  brainCommand: z
    .string({
      invalid_type_error: 'Valeur textuelle attendue.',
    })
    .max(500, 'La commande brain ne peut pas dépasser 500 caractères.')
    .refine((value) => !FORBIDDEN_CONTROL_ONE_LINE.test(value), CONTROL_MESSAGE)
    .optional(),
  terminalCommand: z
    .string({
      invalid_type_error: 'Valeur textuelle attendue.',
    })
    .max(500, 'La commande terminal ne peut pas dépasser 500 caractères.')
    .refine((value) => !FORBIDDEN_CONTROL_ONE_LINE.test(value), CONTROL_MESSAGE)
    .optional(),
})

export type SettingsUpdateInput = z.infer<typeof settingsUpdateSchema>
