/**
 * Validation de chemin & statut du pont — **aucun processus, aucun disque**.
 *
 * Après le remplacement du Local Bridge par le Companion (PLAN.md §2 piste A) :
 * - `assertSafeAbsolutePath` **reste** : c'est une contrainte d'intégrité des
 *   données (allowlist de caractères + confinement sous `devRootPath`), utilisée
 *   par `POST /api/projects` et `POST /api/projects/:id/lead`. Il ne lance rien.
 * - `isBridgeAvailable` / `assertBridgeAllowed` se basent désormais sur la
 *   **présence du Companion** (`companion_presence`), plus sur `localBridge === 'true'`.
 * - Le serveur **ne lit plus jamais** le dossier dev ni ne spawn de process :
 *   scan et exécution sont délégués au Companion via la file `companion_commands`.
 *
 * Allowlist (ne jamais l'affaiblir) : `SAFE_PATH_PATTERN` exclut tout
 * métacaractère cmd.exe — `"` `'` `` ` `` `&` `|` `<` `>` `^` `%` `!` `$`
 * `;` `(` `)` `~` `*` `?` `{` `}` `[]` `:` (après le disque), `\n` `\r` `\0`.
 * Tout chemin est résolu (`path.resolve`) puis contraint à l'intérieur de `devRootPath`.
 */
import path from 'node:path'
import type { BridgeStatus } from '~~/shared/types'
import { badRequest, forbidden } from '~~/server/utils/http'
import { getCompanionStatus } from '~~/server/services/localBridge'

/** Allowlist stricte : lettre de disque, `:`, puis uniquement caractères inoffensifs. */
export const SAFE_PATH_PATTERN = /^[A-Za-z]:[A-Za-z0-9 _.\-\\\/]+$/

interface BridgeConfig {
  localBridge: string
  devRootPath: string
  brainCommand: string
  terminalCommand: string
}

export function bridgeConfig(): BridgeConfig {
  const config = useRuntimeConfig()
  // `.env` n'est pas toujours répercuté sur `runtimeConfig` en `nuxt dev`
  // (les requêtes DB passent parce que `db/index.ts` lit `process.env` directement).
  // On lit donc `process.env` en priorité : comportement identique en local et sur Vercel.
  const fromEnv = (key: string, fallback: string): string => {
    const value = process.env[key]
    return typeof value === 'string' && value.length > 0 ? value : fallback
  }

  return {
    localBridge: fromEnv(
      'NUXT_LOCAL_BRIDGE',
      typeof config.localBridge === 'string' ? config.localBridge : '',
    ),
    devRootPath: fromEnv(
      'NUXT_DEV_ROOT_PATH',
      typeof config.devRootPath === 'string' ? config.devRootPath : '',
    ),
    brainCommand: fromEnv(
      'NUXT_BRAIN_COMMAND',
      typeof config.brainCommand === 'string' ? config.brainCommand : '',
    ),
    terminalCommand: fromEnv(
      'NUXT_TERMINAL_COMMAND',
      typeof config.terminalCommand === 'string' ? config.terminalCommand : '',
    ),
  }
}

/**
 * Statut public du pont — **aucun processus lancé**, aucun accès disque.
 * La disponibilité est la présence du Companion ; `devRootPath` est fourni à
 * titre informatif (il reste nécessaire à la validation de chemin).
 */
export async function isBridgeAvailable(): Promise<BridgeStatus> {
  const status = await getCompanionStatus()
  const { devRootPath } = bridgeConfig()
  const root = devRootPath.trim().length > 0 ? devRootPath : null

  return { available: status.available, reason: status.reason, devRootPath: root }
}

/** Lève un 403 si le Companion est hors ligne (rare : les routes enfilent maintenant). */
export async function assertBridgeAllowed(): Promise<void> {
  const status = await isBridgeAvailable()
  if (!status.available) forbidden(status.reason ?? 'Companion indisponible.')
}

/**
 * Valide un chemin absolu de dossier avant toute écriture ou tout envoi :
 * allowlist de caractères + résolution + confinement strict sous `devRootPath`.
 */
export function assertSafeAbsolutePath(candidate: string): string {
  if (typeof candidate !== 'string') {
    badRequest('Chemin de dossier refusé : valeur non textuelle.')
  }
  if (candidate.length < 5 || candidate.length > 400) {
    badRequest('Chemin de dossier refusé : longueur invalide (5 à 400 caractères).')
  }
  // Vérifiée AVANT le pattern : jamais de caractère de contrôle dans un chemin.
  if (candidate.includes('\0') || candidate.includes('\n') || candidate.includes('\r')) {
    badRequest('Chemin de dossier refusé : caractère de contrôle détecté.')
  }
  if (!SAFE_PATH_PATTERN.test(candidate)) {
    badRequest(
      'Chemin de dossier refusé : caractères non autorisés. Renommez le dossier sans parenthèses, astérisques ni symboles spéciaux.',
    )
  }

  const resolved = path.resolve(candidate)
  if (!SAFE_PATH_PATTERN.test(resolved)) {
    badRequest('Chemin de dossier refusé : caractères non autorisés après résolution.')
  }

  const { devRootPath } = bridgeConfig()
  if (devRootPath.trim().length === 0) {
    badRequest('Racine du dossier dev non configurée (variable NUXT_DEV_ROOT_PATH).')
  }
  const root = path.resolve(devRootPath)
  if (resolved !== root && !resolved.startsWith(root + path.sep)) {
    badRequest('Le chemin doit se trouver à l’intérieur du dossier dev.')
  }
  return resolved
}
