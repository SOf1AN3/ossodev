import { and, count, desc, eq, gte, lte, sql } from 'drizzle-orm'
import { badges, tasks, userBadges, weeklyMissions } from '~~/db/schema'
import { db } from '~~/db'
import type { Badge, GamificationSummary, Mission } from '~~/shared/types'
import { addDaysISO, todayISO } from '~~/server/validation/tasks'
import { weekRange } from '~~/server/validation/missions'
import type { MissionCreateInput } from '~~/server/validation/missions'
import { apiError, badRequest } from '~~/server/utils/http'

/**
 * Cœur de la gamification : points, niveaux, séries (streaks), badges et missions.
 *
 * Sémantique des dates (CRUCIAL) :
 * - `scheduled_date` est une date civile `YYYY-MM-DD` SANS fuseau ;
 * - « Aujourd'hui » = date LOCALE du serveur (jamais UTC) via `todayISO()` ;
 * - semaine civile = lundi → dimanche (`weekRange`).
 *
 * Un jour SANS tâche planifiée est NEUTRE : il ne casse jamais le streak.
 * Un jour est RÉUSSI ssi `scheduled > 0 && done === scheduled`.
 * Le streak courant se calcule depuis hier (aujourd'hui incomplet ne casse rien ;
 * il n'ajoute 1 que s'il est déjà réussi).
 */

// ---------------------------------------------------------------------------
// Constantes
// ---------------------------------------------------------------------------

export const POINTS_PER_LEVEL = 500

export const LEVEL_RANKS: string[] = [
  'Débutant',
  'Apprenti',
  'Praticien',
  'Confirmé',
  'Expert',
  'Lead',
  'Architecte',
  'Maître',
  'Légende',
  'Monarque',
]

/** Fenêtre d'historique chargée pour les calculs de séries (3 ans). */
const HISTORY_DAYS = 1095
/** Plafond de remontée du streak courant (2 ans) — anti-boucle infinie. */
const STREAK_SCAN_DAYS = 730
/** Plafond du parcours chronologique du meilleur streak — anti-boucle infinie. */
const BEST_STREAK_SCAN_DAYS = 1095
/** Plafond du parcours « comeback » — anti-boucle infinie. */
const COMEBACK_SCAN_DAYS = 1095

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Compteurs agrégés d'un jour civil. */
export interface DayCount {
  scheduled: number
  done: number
  points: number
}

/** `Map<YYYY-MM-DD, DayCount>` — seuls les jours AYANT des tâches sont présents. */
export type DailyCounts = Map<string, DayCount>

export interface StreakResult {
  streak: number
  bestStreak: number
}

export interface TodayCounts {
  doneToday: number
  scheduledToday: number
}

export type BadgeWithEarned = Badge & { earned_at: string | null }

export interface BadgeEvaluation {
  /** Badges NOUVELLEMENT gagnés à cet appel (idempotent). */
  earned: Badge[]
  /** Catalogue complet enrichi de `earned_at` (null si non gagné). */
  all: BadgeWithEarned[]
}

export interface GamificationRecords {
  bestStreak: number
  totalTasks: number
  totalPoints: number
  totalDaysWorked: number
  bestDay: { date: string; points: number; done: number } | null
  bestWeek: { weekStart: string; points: number; done: number } | null
  completionRate30: number
}

export interface CurrentMissionView {
  mission: Mission | null
  progress: number
  is_completed: boolean
}

/** État interne mutualisé entre `computeSummary` et `evaluateBadges`. */
interface GamificationState {
  today: string
  counts: DailyCounts
  totalPoints: number
  totalTasksDone: number
  streak: number
  bestStreak: number
  hasPerfectDay: boolean
  hasPerfectWeek: boolean
  hasComeback: boolean
}

/** Faits évalués pour trancher les règles de badges. */
interface BadgeContext {
  streak: number
  totalTasksDone: number
  hasPerfectDay: boolean
  hasPerfectWeek: boolean
  hasCompletedMission: boolean
  hasComeback: boolean
}

type MissionRow = typeof weeklyMissions.$inferSelect

// ---------------------------------------------------------------------------
// Niveaux (purs)
// ---------------------------------------------------------------------------

export function levelForPoints(totalPoints: number): number {
  return Math.floor(totalPoints / POINTS_PER_LEVEL) + 1
}

export function levelNameFor(level: number): string {
  return LEVEL_RANKS[Math.min(level - 1, LEVEL_RANKS.length - 1)] ?? 'Débutant'
}

// ---------------------------------------------------------------------------
// Agrégation journalière
// ---------------------------------------------------------------------------

/**
 * Requête groupée EN UNE PASSE sur `tasks` : par `scheduled_date`,
 * le total planifié, le total terminé (`status = 'done'`) et les points gagnés.
 * Seuls les jours ayant au moins une tâche apparaissent dans le résultat.
 */
export async function getDailyCounts(fromISO: string, toISO: string): Promise<DailyCounts> {
  const rows = await db
    .select({
      date: tasks.scheduled_date,
      scheduled: count(),
      done: sql<number>`sum(case when ${tasks.status} = 'done' then 1 else 0 end)`,
      points: sql<number>`sum(case when ${tasks.status} = 'done' then ${tasks.points} else 0 end)`,
    })
    .from(tasks)
    .where(and(gte(tasks.scheduled_date, fromISO), lte(tasks.scheduled_date, toISO)))
    .groupBy(tasks.scheduled_date)

  const counts: DailyCounts = new Map()
  for (const row of rows) {
    counts.set(row.date, {
      scheduled: row.scheduled,
      done: Number(row.done ?? 0),
      points: Number(row.points ?? 0),
    })
  }
  return counts
}

/** Un jour est réussi ssi il a des tâches et toutes sont terminées. */
function isSuccess(count: DayCount | undefined): boolean {
  return count !== undefined && count.scheduled > 0 && count.done === count.scheduled
}

/**
 * Streak courant + meilleur streak.
 * - jour sans tâche → NEUTRE (ignoré, ne casse rien) ;
 * - streak courant : remontée depuis hier, plafonnée à STREAK_SCAN_DAYS jours ;
 *   aujourd'hui réussi ajoute 1, aujourd'hui incomplet n'ajoute ni ne casse ;
 * - meilleur streak : parcours chronologique des jours ayant des tâches,
 *   plafonné à BEST_STREAK_SCAN_DAYS jours.
 */
export function computeStreak(counts: DailyCounts, today: string = todayISO()): StreakResult {
  let streak = 0
  let cursor = addDaysISO(today, -1)
  for (let i = 0; i < STREAK_SCAN_DAYS; i++) {
    const count = counts.get(cursor)
    if (count !== undefined) {
      if (!isSuccess(count)) break
      streak += 1
    }
    // jour absent du Map = jour sans tâche = neutre → on saute
    cursor = addDaysISO(cursor, -1)
  }
  if (isSuccess(counts.get(today))) streak += 1

  let bestStreak = 0
  let current = 0
  const dates = [...counts.keys()].sort()
  for (let i = 0; i < dates.length && i < BEST_STREAK_SCAN_DAYS; i++) {
    const date = dates[i]
    if (date === undefined) break
    const day = counts.get(date)
    if (isSuccess(day)) {
      current += 1
      if (current > bestStreak) bestStreak = current
    } else {
      current = 0
    }
  }

  return { streak, bestStreak }
}

export function getTodayCounts(counts: DailyCounts, today: string = todayISO()): TodayCounts {
  const count = counts.get(today)
  return {
    doneToday: count?.done ?? 0,
    scheduledToday: count?.scheduled ?? 0,
  }
}

// ---------------------------------------------------------------------------
// État global (une seule passe de chargement)
// ---------------------------------------------------------------------------

function hasPerfectDayIn(counts: DailyCounts): boolean {
  for (const count of counts.values()) {
    if (isSuccess(count)) return true
  }
  return false
}

/** Une semaine est « sans faute » si tous ses jours AYANT des tâches sont réussis. */
function hasPerfectWeekIn(counts: DailyCounts): boolean {
  const weeks = new Map<string, { scheduledDays: number; successDays: number }>()
  for (const [date, count] of counts) {
    if (count.scheduled === 0) continue
    const weekStart = weekRange(date).weekStart
    const week = weeks.get(weekStart) ?? { scheduledDays: 0, successDays: 0 }
    week.scheduledDays += 1
    if (isSuccess(count)) week.successDays += 1
    weeks.set(weekStart, week)
  }
  for (const week of weeks.values()) {
    if (week.scheduledDays > 0 && week.scheduledDays === week.successDays) return true
  }
  return false
}

/**
 * Comeback : un jour réussi suivi d'au moins 3 jours consécutifs SANS tâche,
 * puis d'au moins un jour réussi. Plafonné à COMEBACK_SCAN_DAYS jours.
 */
function hasComebackIn(counts: DailyCounts, today: string): boolean {
  const succeeded = [...counts.keys()].filter((date) => isSuccess(counts.get(date))).sort()
  const maxIndex = Math.min(succeeded.length, COMEBACK_SCAN_DAYS)
  for (let i = 0; i < maxIndex; i++) {
    const date = succeeded[i]
    if (date === undefined) break
    // Les 3 jours suivants doivent être absents du Map (= sans aucune tâche).
    if (counts.has(addDaysISO(date, 1))) continue
    if (counts.has(addDaysISO(date, 2))) continue
    if (counts.has(addDaysISO(date, 3))) continue
    // Puis au moins un jour réussi à partir de date + 4 (et pas dans le futur).
    for (let j = i + 1; j < succeeded.length; j++) {
      const later = succeeded[j]
      if (later === undefined) break
      if (later < addDaysISO(date, 4)) continue
      if (later > today) break
      return true
    }
  }
  return false
}

async function loadState(): Promise<GamificationState> {
  const today = todayISO()
  const from = addDaysISO(today, -HISTORY_DAYS)

  const [counts, totals, doneRow] = await Promise.all([
    getDailyCounts(from, today),
    db
      .select({
        totalTasks: count(),
        totalPoints: sql<number>`sum(case when ${tasks.status} = 'done' then ${tasks.points} else 0 end)`,
      })
      .from(tasks),
    db.select({ n: count() }).from(tasks).where(eq(tasks.status, 'done')),
  ])

  const totalPoints = Number(totals[0]?.totalPoints ?? 0)
  const totalTasksDone = doneRow[0]?.n ?? 0
  const { streak, bestStreak } = computeStreak(counts, today)

  return {
    today,
    counts,
    totalPoints,
    totalTasksDone,
    streak,
    bestStreak,
    hasPerfectDay: hasPerfectDayIn(counts),
    hasPerfectWeek: hasPerfectWeekIn(counts),
    hasComeback: hasComebackIn(counts, today),
  }
}

// ---------------------------------------------------------------------------
// Résumé
// ---------------------------------------------------------------------------

function buildSummary(state: GamificationState): GamificationSummary {
  const level = levelForPoints(state.totalPoints)
  const { doneToday, scheduledToday } = getTodayCounts(state.counts, state.today)
  const completionRatio =
    scheduledToday === 0 ? 0 : Math.round((doneToday / scheduledToday) * 100) / 100

  return {
    points: state.totalPoints,
    level,
    levelName: levelNameFor(level),
    nextLevelAt: level * POINTS_PER_LEVEL,
    streak: state.streak,
    bestStreak: state.bestStreak,
    doneToday,
    scheduledToday,
    completionRatio,
  }
}

export async function computeSummary(): Promise<GamificationSummary> {
  return buildSummary(await loadState())
}

// ---------------------------------------------------------------------------
// Missions hebdomadaires
// ---------------------------------------------------------------------------

function mapMission(row: MissionRow): Mission {
  return {
    id: row.id,
    week_start: row.week_start,
    title: row.title,
    target: row.target,
    created_at: row.created_at.toISOString(),
  }
}

/** Mission de la semaine courante + progression (tâches terminées [lundi, dimanche]). */
export async function getCurrentMission(): Promise<CurrentMissionView> {
  const { weekStart, weekEnd } = weekRange(todayISO())

  const [missionRow, progressRow] = await Promise.all([
    db.select().from(weeklyMissions).where(eq(weeklyMissions.week_start, weekStart)).limit(1),
    db
      .select({ done: count() })
      .from(tasks)
      .where(
        and(
          eq(tasks.status, 'done'),
          gte(tasks.scheduled_date, weekStart),
          lte(tasks.scheduled_date, weekEnd),
        ),
      ),
  ])

  const progress = progressRow[0]?.done ?? 0
  const firstMission = missionRow[0]
  const mission = firstMission !== undefined ? mapMission(firstMission) : null

  return {
    mission,
    progress,
    is_completed: mission !== null && progress >= mission.target,
  }
}

/** Crée la mission de la semaine courante. `week_start` est calculé côté serveur. */
export async function createMission(input: MissionCreateInput): Promise<Mission> {
  const { weekStart } = weekRange(todayISO())

  const existing = await db
    .select({ id: weeklyMissions.id })
    .from(weeklyMissions)
    .where(eq(weeklyMissions.week_start, weekStart))
    .limit(1)
  if (existing.length > 0) {
    badRequest('Une mission existe déjà pour cette semaine.', 'MISSION_EXISTS')
  }

  const rows = await db
    .insert(weeklyMissions)
    .values({
      week_start: weekStart,
      title: input.title,
      target: input.target,
      // created_at : default DB.
    })
    .returning()

  const created = rows[0]
  if (created === undefined) apiError('INTERNAL', 'Création impossible.', 500)
  return mapMission(created)
}

/** Vrai ssi au moins une mission a une progression (tâches terminées de sa semaine) >= target. */
async function hasCompletedMission(): Promise<boolean> {
  const rows = await db
    .select({
      target: weeklyMissions.target,
      done: count(tasks.id),
    })
    .from(weeklyMissions)
    .leftJoin(
      tasks,
      and(
        eq(tasks.status, 'done'),
        gte(tasks.scheduled_date, weeklyMissions.week_start),
        lte(tasks.scheduled_date, sql`${weeklyMissions.week_start} + 6`),
      ),
    )
    .groupBy(weeklyMissions.id, weeklyMissions.target)

  return rows.some((row) => row.done >= row.target)
}

// ---------------------------------------------------------------------------
// Badges
// ---------------------------------------------------------------------------

function evaluateRules(ctx: BadgeContext): Record<string, boolean> {
  return {
    first_step: ctx.totalTasksDone >= 1,
    streak_3: ctx.streak >= 3,
    streak_7: ctx.streak >= 7,
    streak_30: ctx.streak >= 30,
    streak_100: ctx.streak >= 100,
    tasks_25: ctx.totalTasksDone >= 25,
    tasks_100: ctx.totalTasksDone >= 100,
    tasks_500: ctx.totalTasksDone >= 500,
    perfect_day: ctx.hasPerfectDay,
    perfect_week: ctx.hasPerfectWeek,
    mission_1: ctx.hasCompletedMission,
    comeback: ctx.hasComeback,
  }
}

/**
 * Évaluation idempotente des badges (appelée à chaque lecture du résumé) :
 * 1. charge l'état de gamification + les `user_badges` existants ;
 * 2. évalue les 12 règles ;
 * 3. insère les manquantes via `ON CONFLICT (badge_code) DO NOTHING`
 *    et retourne les NOUVELLEMENT gagnées ;
 * 4. retourne aussi le catalogue complet enrichi de `earned_at`.
 */
export async function evaluateBadges(): Promise<BadgeEvaluation> {
  const state = await loadState()
  const [missionDone, catalog, owned] = await Promise.all([
    hasCompletedMission(),
    db.select().from(badges),
    db.select().from(userBadges),
  ])

  const rules = evaluateRules({
    streak: state.streak,
    totalTasksDone: state.totalTasksDone,
    hasPerfectDay: state.hasPerfectDay,
    hasPerfectWeek: state.hasPerfectWeek,
    hasCompletedMission: missionDone,
    hasComeback: state.hasComeback,
  })

  const catalogCodes = new Set(catalog.map((badge) => badge.code))
  const earnedAtByCode = new Map<string, string>(owned.map((row) => [row.badge_code, row.earned_at.toISOString()]))

  const newlyCodes = Object.keys(rules)
    .filter((code) => rules[code] === true)
    .filter((code) => catalogCodes.has(code))
    .filter((code) => !earnedAtByCode.has(code))

  let inserted: typeof owned = []
  if (newlyCodes.length > 0) {
    inserted = await db
      .insert(userBadges)
      .values(newlyCodes.map((code) => ({ badge_code: code })))
      .onConflictDoNothing({ target: userBadges.badge_code })
      .returning()
    for (const row of inserted) {
      earnedAtByCode.set(row.badge_code, row.earned_at.toISOString())
    }
  }

  const insertedCodes = new Set(inserted.map((row) => row.badge_code))
  const earned = catalog.filter((badge) => insertedCodes.has(badge.code))

  const all: BadgeWithEarned[] = catalog.map((badge) => ({
    code: badge.code,
    name: badge.name,
    description: badge.description,
    icon: badge.icon,
    earned_at: earnedAtByCode.get(badge.code) ?? null,
  }))

  return { earned, all }
}

// ---------------------------------------------------------------------------
// Records
// ---------------------------------------------------------------------------

const dayPointsExpr = sql<number>`sum(case when ${tasks.status} = 'done' then ${tasks.points} else 0 end)`
const dayDoneExpr = sql<number>`sum(case when ${tasks.status} = 'done' then 1 else 0 end)`

export async function getRecords(): Promise<GamificationRecords> {
  const state = await loadState()
  const today = state.today

  const [aggRow, bestDayRows, bestWeekRows, recentDates] = await Promise.all([
    db
      .select({
        totalTasks: count(),
        totalDaysWorked: sql<number>`count(distinct ${tasks.scheduled_date})`,
      })
      .from(tasks),
    db
      .select({
        date: tasks.scheduled_date,
        points: dayPointsExpr,
        done: dayDoneExpr,
      })
      .from(tasks)
      .groupBy(tasks.scheduled_date)
      .orderBy(desc(dayPointsExpr), desc(dayDoneExpr), desc(tasks.scheduled_date))
      .limit(1),
    db
      .select({
        weekStart: sql<string>`to_char(date_trunc('week', ${tasks.scheduled_date}::timestamp), 'YYYY-MM-DD')`,
        points: dayPointsExpr,
        done: dayDoneExpr,
      })
      .from(tasks)
      .where(gte(tasks.scheduled_date, addDaysISO(today, -HISTORY_DAYS)))
      .groupBy(sql`week_start`)
      .orderBy(desc(dayPointsExpr), desc(dayDoneExpr), desc(sql`week_start`))
      .limit(1),
    db
      .selectDistinct({ date: tasks.scheduled_date })
      .from(tasks)
      .orderBy(desc(tasks.scheduled_date))
      .limit(30),
  ])

  const agg = aggRow[0]
  const bestDay = bestDayRows[0]
  const bestWeek = bestWeekRows[0]

  let completionRate30 = 0
  const oldestRow = recentDates[recentDates.length - 1]
  if (recentDates.length > 0 && oldestRow !== undefined) {
    const counts = await getDailyCounts(oldestRow.date, today)
    let sum = 0
    for (const { date } of recentDates) {
      const day = counts.get(date)
      if (day !== undefined && day.scheduled > 0) sum += day.done / day.scheduled
    }
    completionRate30 = Math.round((sum / recentDates.length) * 100) / 100
  }

  return {
    bestStreak: state.bestStreak,
    totalTasks: agg?.totalTasks ?? 0,
    totalPoints: state.totalPoints,
    totalDaysWorked: Number(agg?.totalDaysWorked ?? 0),
    bestDay: bestDay
      ? {
          date: bestDay.date,
          points: Number(bestDay.points ?? 0),
          done: Number(bestDay.done ?? 0),
        }
      : null,
    bestWeek: bestWeek
      ? {
          weekStart: bestWeek.weekStart,
          points: Number(bestWeek.points ?? 0),
          done: Number(bestWeek.done ?? 0),
        }
      : null,
    completionRate30,
  }
}
