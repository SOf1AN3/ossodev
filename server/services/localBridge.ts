/**
 * File d'attente des commandes Companion (PLAN.md §2 piste A).
 *
 * Le serveur **n'exécute plus rien** : il n'insère que des commandes signées
 * dans `companion_commands`, que le Companion (processus local) réclame et
 * exécute. Aucun `child_process`, aucun accès disque local ici.
 *
 * Piliers de sécurité :
 * - **Liste blanche** : `ALLOWED_COMMAND_KEYS` est une constante serveur,
 *   **jamais** étendue depuis la base. Toute clé hors liste → 400.
 * - **Expiration** : `expires_at = now + 120 s` — une commande jamais réclamée
 *   expire et n'est jamais retournée.
 * - **Réclamation atomique** : `UPDATE … WHERE status='pending' AND expires_at > now`
 *   en transaction — deux Companion (ou un rejeu) ne peuvent pas exécuter deux fois.
 * - **Anti-blocage** : les `claimed` dont `claimed_at > 60 s` repassent en
 *   `pending` (un Companion mort ne bloque jamais la file).
 * - **Signature** : HMAC-SHA256 calculée à l'enfilage, **jamais** retournée.
 */
import { randomUUID } from 'node:crypto'
import { and, eq, gt, lt } from 'drizzle-orm'
import { db } from '~~/db'
import { companionCommands, companionPresence, projects } from '~~/db/schema'
import { badRequest } from '~~/server/utils/http'
import { signCommand } from '~~/server/utils/companionAuth'
import { upsertProjectByPath } from '~~/server/repositories/projects'
import type {
  CompanionCommand,
  CompanionCommandKey,
  CompanionCommandPayload,
  CompanionStatus,
} from '~~/shared/types'

/** Liste blanche des commandes — constante serveur, jamais étendue depuis la DB. */
export const ALLOWED_COMMAND_KEYS = ['opencode:lead', 'brain:scan', 'brain:run'] as const

export type AllowedCommandKey = (typeof ALLOWED_COMMAND_KEYS)[number]

/** Durée de vie d'une commande : `created_at + 120 s`. */
const COMMAND_TTL_MS = 120_000

/** Une commande réclamée mais non finalisée depuis 60 s est remise en file. */
const CLAIM_STALE_MS = 60_000

/** Fenêtre de présence : Companion « en ligne » si `now − last_seen_at < 45 s`. */
const PRESENCE_WINDOW_MS = 45_000

/** Identifiant de la ligne de présence (poste local unique). */
const PRESENCE_ID = 'local'

/** Réponse d'enfilage — jamais de `signature`, jamais de payload renvoyé. */
export interface EnqueuedCommand {
  command_id: string
  status: 'pending'
}

function isAllowedCommandKey(key: string): key is AllowedCommandKey {
  return (ALLOWED_COMMAND_KEYS as readonly string[]).includes(key)
}

/**
 * Met une commande en file. Rejette tout `command_key` hors liste blanche (400).
 * La signature est calculée **après** génération de l'`id` (il en fait partie).
 */
export async function enqueueCommand(
  commandKey: string,
  payload: CompanionCommandPayload,
): Promise<EnqueuedCommand> {
  if (!isAllowedCommandKey(commandKey)) {
    badRequest(
      `Commande refusée : « ${commandKey} » ne fait pas partie de la liste blanche.`,
      'COMMAND_NOT_ALLOWED',
    )
  }

  const id = randomUUID()
  const expiresAt = new Date(Date.now() + COMMAND_TTL_MS)
  const signature = signCommand({
    id,
    command_key: commandKey,
    payload,
    expires_at: expiresAt.toISOString(),
  })

  await db.insert(companionCommands).values({
    id,
    command_key: commandKey,
    payload,
    signature,
    status: 'pending',
    expires_at: expiresAt,
  })

  return { command_id: id, status: 'pending' }
}

/** Une commande est expirée si `expires_at` est déjà passé. */
export function isCommandExpired(row: { expires_at: Date }): boolean {
  return row.expires_at.getTime() < Date.now()
}

/**
 * Remet en `pending` les commandes réclamées depuis plus de 60 s :
 * un Companion mort (redémarrage, crash) ne bloque jamais la file.
 * `claimed_at` est vidé pour repartir d'une fraîcheur neutre.
 */
export async function reclaimStaleClaims(): Promise<number> {
  const cutoff = new Date(Date.now() - CLAIM_STALE_MS)
  const rows = await db
    .update(companionCommands)
    .set({ status: 'pending', claimed_at: null })
    .where(and(eq(companionCommands.status, 'claimed'), lt(companionCommands.claimed_at, cutoff)))
    .returning({ id: companionCommands.id })
  return rows.length
}

/**
 * Convertit une ligne DB en `CompanionCommand` publique.
 *
 * `signature` et `expires_at` **font partie de la réponse** : le Companion
 * vérifie le HMAC avant exécution. Sans lui, il ne peut pas détecter une ligne
 * forgée en base — c'est précisément la défense recherchée.
 * Retourner un HMAC **ne divulgue pas la clé** (non réversible).
 */
function toPublicCommand(row: typeof companionCommands.$inferSelect): CompanionCommand {
  const payload =
    row.payload !== null && typeof row.payload === 'object' && !Array.isArray(row.payload)
      ? (row.payload as CompanionCommandPayload)
      : {}
  return {
    id: row.id,
    command_key: row.command_key as CompanionCommandKey,
    payload,
    created_at: row.created_at.toISOString(),
    expires_at: row.expires_at.toISOString(),
    signature: row.signature,
  }
}

/**
 * Réclame **atomiquement** toutes les commandes `pending` non expirées :
 * 1. remise en file des `claimed` stale (Companion mort) ;
 * 2. `UPDATE … SET status='claimed', claimed_at=now WHERE status='pending' AND expires_at > now RETURNING`.
 * En transaction — chaque ligne n'est réclamée qu'une seule fois.
 */
export async function claimPendingCommands(): Promise<CompanionCommand[]> {
  // 1. Companion mort ? Ses `claimed` stale repassent en `pending` d'abord.
  await reclaimStaleClaims()

  // 2. Réclamation atomique en transaction : chaque ligne n'est prise qu'une fois.
  return await db.transaction(async (tx) => {
    const now = new Date()
    const rows = await tx
      .update(companionCommands)
      .set({ status: 'claimed', claimed_at: now })
      .where(and(eq(companionCommands.status, 'pending'), gt(companionCommands.expires_at, now)))
      .returning()

    return rows
      .slice()
      .sort((a, b) => a.created_at.getTime() - b.created_at.getTime())
      .map(toPublicCommand)
  })
}

/** Statut public de la pastille — calcul pur sur `companion_presence`. */
export async function getCompanionStatus(): Promise<CompanionStatus> {
  const rows = await db
    .select()
    .from(companionPresence)
    .where(eq(companionPresence.id, PRESENCE_ID))
    .limit(1)

  const row = rows[0]
  if (!row) {
    return {
      available: false,
      lastSeenAt: null,
      reason: 'Companion jamais démarré sur ce poste.',
    }
  }

  const lastSeenAt = row.last_seen_at
  const available = Date.now() - lastSeenAt.getTime() < PRESENCE_WINDOW_MS

  return {
    available,
    lastSeenAt: lastSeenAt.toISOString(),
    reason: available ? null : 'Companion hors ligne : dernière présence il y a plus de 45 s.',
  }
}

/** Upsert de la présence (`id='local'`) → renvoie la date vue (ISO 8601). */
export async function recordHeartbeat(appVersion?: string): Promise<{ lastSeenAt: string }> {
  const now = new Date()
  await db
    .insert(companionPresence)
    .values({ id: PRESENCE_ID, last_seen_at: now, app_version: appVersion ?? null })
    .onConflictDoUpdate({
      target: companionPresence.id,
      set: { last_seen_at: now, app_version: appVersion ?? null },
    })

  return { lastSeenAt: now.toISOString() }
}

/** Projet reçu du Companion (résultat de scan). */
export interface BrainScanProject {
  name: string
  folder_path: string
}

/** Corps de `POST /api/companion/brain-result`. */
export interface BrainScanInput {
  dev_root: string
  projects: BrainScanProject[]
  errors: string[]
}

/** Résultat d'ingestion : créés vs mis à jour. */
export interface BrainScanIngestResult {
  added: number
  updated: number
}

/**
 * Ingestion du résultat de scan renvoyé par le Companion :
 * `upsertProjectByPath` pour chaque projet, `last_scan_at = now` sur chacun,
 * puis décompte des créations / mises à jour. Zéro accès disque côté serveur.
 */
export async function ingestBrainScan(input: BrainScanInput): Promise<BrainScanIngestResult> {
  const now = new Date()
  let added = 0
  let updated = 0

  for (const project of input.projects) {
    const existing = await db
      .select({ id: projects.id })
      .from(projects)
      .where(eq(projects.folder_path, project.folder_path))
      .limit(1)
    const existed = existing.length > 0

    await upsertProjectByPath(project.name, project.folder_path)

    if (existed) {
      updated += 1
    } else {
      // L'insertion laisse `last_scan_at` NULL : on le pose explicitement.
      await db
        .update(projects)
        .set({ last_scan_at: now })
        .where(eq(projects.folder_path, project.folder_path))
      added += 1
    }
  }

  return { added, updated }
}
