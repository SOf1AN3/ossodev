import { ref, type Ref } from 'vue'
import type { Badge, GamificationSummary, Mission } from '~~/shared/types'
import { apiFetch } from './useApi'
import { useToast } from './useToast'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Records renvoyés par `GET /api/gamification/records`. */
export interface Records {
  bestStreak: number
  totalTasks: number
  totalPoints: number
  totalDaysWorked: number
  bestDay: { date: string; points: number; done: number } | null
  bestWeek: { weekStart: string; points: number; done: number } | null
  /** 0 → 1 */
  completionRate30: number
}

/** Badge enrichi de sa date de obtenue (`null` = non gagné). */
export interface BadgeWithEarnedAt extends Badge {
  earned_at: string | null
}

/** Mission de la semaine courante + avancement. */
export interface CurrentMission {
  mission: Mission | null
  progress: number
  is_completed: boolean
}

/** Charge utile de `POST /api/gamification/missions` (`week_start` calculé côté serveur). */
export interface MissionCreatePayload {
  title: string
  target: number
}

export type CreateMissionResult = 'created' | 'existing'

/** Enveloppe complète de `GET /api/gamification/summary`. */
interface GamificationSummaryPayload extends GamificationSummary {
  newlyEarned: Badge[]
}

// ---------------------------------------------------------------------------
// Store partagé au module : chargé **une seule fois par session**
// (même garde que `useBridge` — aucun double appel entre les pages).
// ---------------------------------------------------------------------------

const summary: Ref<GamificationSummary | null> = ref(null)
const badges: Ref<BadgeWithEarnedAt[]> = ref([])
const records: Ref<Records | null> = ref(null)
const mission: Ref<CurrentMission | null> = ref(null)
/**
 * Badges gagnés lors du dernier résumé.
 *
 * Exposé tel quel — les pages en ont besoin pour déclencher le moment ②
 * (ignition de la carte). L'événement ne doit JAMAIS être consommé en silence
 * dans `applySummary` : sinon l'animation ne peut jamais partir.
 * Une page lève via `clearNewlyEarned()` une fois qu'elle a joué l'animation.
 */
const newlyEarned: Ref<Badge[]> = ref([])
const pending = ref(false)
const error = ref<string | null>(null)

let loaded = false
let inFlight: Promise<void> | null = null

/** Traduit une erreur inconnue en message français lisible. */
function toErrorMessage(err: unknown, fallback: string): string {
  if (err instanceof Error) {
    const message = err.message.trim()
    if (
      message !== '' &&
      message !== 'Failed to fetch' &&
      message !== 'fetch failed'
    ) {
      return message
    }
  }
  return fallback
}

/** Applique le résumé, expose les badges gagnés et les annonce par toast. */
function applySummary(payload: GamificationSummaryPayload): void {
  const { newlyEarned: earned, ...stats } = payload
  summary.value = stats
  newlyEarned.value = earned

  if (earned.length > 0) {
    const toast = useToast()
    const list = earned.map((badge) => `${badge.icon} ${badge.name}`)
    toast.show({
      tone: 'success',
      title:
        earned.length > 1
          ? `${earned.length} nouveaux badges !`
          : 'Nouveau badge débloqué !',
      message: list.join(' · '),
    })
  }
}

async function fetchSummary(): Promise<void> {
  const payload = await apiFetch<GamificationSummaryPayload>(
    '/api/gamification/summary',
  )
  applySummary(payload)
}

async function fetchBadges(): Promise<void> {
  badges.value = await apiFetch<BadgeWithEarnedAt[]>(
    '/api/gamification/badges',
  )
}

async function fetchRecords(): Promise<void> {
  records.value = await apiFetch<Records>('/api/gamification/records')
}

async function fetchMission(): Promise<void> {
  mission.value = await apiFetch<CurrentMission>(
    '/api/gamification/missions/current',
  )
}

/**
 * Charge summary + badges + records + mission en parallèle.
 * Garde anti-double-chargement : une seule exécution à la fois, et
 * `loaded` évite tout rechargement inutile ensuite (une fois par session).
 * Les échecs sont stockés dans `error` (jamais propagés) pour que les
 * pages affichent leur propre état d'erreur avec un bouton « Réessayer ».
 */
function load(): Promise<void> {
  if (loaded) return Promise.resolve()
  if (inFlight !== null) return inFlight

  pending.value = true
  error.value = null
  inFlight = (async () => {
    try {
      await Promise.all([
        fetchSummary(),
        fetchBadges(),
        fetchRecords(),
        fetchMission(),
      ])
      loaded = true
    } catch (err) {
      error.value = toErrorMessage(
        err,
        'Impossible de charger tes statistiques.',
      )
    } finally {
      pending.value = false
      inFlight = null
    }
  })()
  return inFlight
}

/**
 * Rafraîchit uniquement le résumé (points, streak, du jour…).
 * À appeler après chaque changement de tâche. Opportuniste : en cas
 * d'échec on conserve le dernier résumé connu sans casser l'UI.
 */
async function refreshSummary(): Promise<void> {
  try {
    await fetchSummary()
  } catch {
    // Résumé non critique : on garde la dernière valeur chargée.
  }
}

/**
 * Crée la mission de la semaine courante.
 * Si le serveur répond 400 « mission déjà existante », on recharge la
 * mission en cours et on signale `'existing'` au lieu d'afficher une erreur.
 */
async function createMission(
  payload: MissionCreatePayload,
): Promise<CreateMissionResult> {
  try {
    await apiFetch<Mission>('/api/gamification/missions', {
      method: 'POST',
      body: payload,
    })
  } catch (err) {
    let existing: CurrentMission | null = null
    try {
      await fetchMission()
      existing = mission.value
    } catch {
      existing = null
    }
    if (existing !== null && existing.mission !== null) {
      return 'existing'
    }
    throw new Error(
      toErrorMessage(err, 'Impossible de créer la mission de la semaine.'),
    )
  }
  await fetchMission()
  return 'created'
}

/** Vide la liste des badges gagnés — à appeler après avoir joué l'animation (moment ②). */
function clearNewlyEarned(): void {
  newlyEarned.value = []
}

export function useGamification() {
  return {
    summary,
    badges,
    records,
    mission,
    pending,
    error,
    newlyEarned,
    load,
    refreshSummary,
    createMission,
    clearNewlyEarned,
  }
}
