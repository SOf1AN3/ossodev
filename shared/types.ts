/**
 * Types partagés OSSO — purs TypeScript (aucun import ORM).
 * Importables partout via `~~/shared/types`.
 * Correspondance 1:1 avec `db/schema.ts` (colonnes snake_case).
 */

// ---------------------------------------------------------------------------
// Enums / littéraux
// ---------------------------------------------------------------------------

export type TaskStatus = 'todo' | 'doing' | 'done'
export type TaskSource = 'oneoff' | 'routine'
export type RoutineFrequency = 'daily' | 'weekly'
/** 0 = dimanche … 6 = samedi */
export type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6

// ---------------------------------------------------------------------------
// Lignes complètes (rows)
// ---------------------------------------------------------------------------

export interface Task {
  id: string
  title: string
  notes: string | null
  status: TaskStatus
  priority: number
  source: TaskSource
  /** Format YYYY-MM-DD */
  scheduled_date: string
  routine_id: string | null
  points: number
  /** ISO 8601 */
  completed_at: string | null
  /** ISO 8601 */
  created_at: string
  /** ISO 8601 */
  updated_at: string
}

export interface Routine {
  id: string
  title: string
  frequency: RoutineFrequency
  /** 0=dimanche … 6=samedi ; null si daily */
  weekdays: number[] | null
  points: number
  is_active: boolean
  /** Format YYYY-MM-DD */
  start_date: string
  /** ISO 8601 */
  created_at: string
  /** ISO 8601 */
  updated_at: string
}

export interface Project {
  id: string
  name: string
  folder_path: string
  /** ISO 8601 */
  last_scan_at: string | null
  is_archived: boolean
  /** ISO 8601 */
  created_at: string
}

export interface ProjectTask {
  id: string
  project_id: string
  title: string
  position: number
  is_done: boolean
  /** ISO 8601 */
  created_at: string
  /** ISO 8601 */
  updated_at: string
}

export interface Idea {
  id: string
  title: string
  description: string | null
  /** ISO 8601 */
  created_at: string
}

export interface Badge {
  code: string
  name: string
  description: string
  icon: string
}

export interface UserBadge {
  id: string
  badge_code: string
  /** ISO 8601 */
  earned_at: string
}

export interface Mission {
  id: string
  /** Lundi de la semaine, format YYYY-MM-DD */
  week_start: string
  title: string
  target: number
  /** ISO 8601 */
  created_at: string
}

export interface LeadSession {
  id: string
  project_id: string
  prompt_snapshot: string
  /** ISO 8601 */
  launched_at: string
}

// ---------------------------------------------------------------------------
// Payloads de création
// ---------------------------------------------------------------------------

export interface TaskInput {
  title: string
  notes?: string | null
  status?: TaskStatus
  priority?: number
  source?: TaskSource
  /** Format YYYY-MM-DD */
  scheduled_date: string
  routine_id?: string | null
  points?: number
  /** ISO 8601 */
  completed_at?: string | null
}

export interface RoutineInput {
  title: string
  frequency: RoutineFrequency
  /** 0=dimanche … 6=samedi ; null si daily */
  weekdays?: number[] | null
  points?: number
  is_active?: boolean
  /** Format YYYY-MM-DD */
  start_date?: string
}

export interface ProjectInput {
  name: string
  folder_path: string
  is_archived?: boolean
}

export interface ProjectTaskInput {
  project_id: string
  title: string
  position?: number
  is_done?: boolean
}

export interface IdeaInput {
  title: string
  description?: string | null
}

export interface MissionInput {
  /** Lundi de la semaine, format YYYY-MM-DD */
  week_start: string
  title: string
  target: number
}

// ---------------------------------------------------------------------------
// Réglages & pont local
// ---------------------------------------------------------------------------

export interface Settings {
  leadIntroTemplate: string
  brainCommand: string
  terminalCommand: string
}

export interface BridgeStatus {
  available: boolean
  reason: string | null
  devRootPath: string | null
}

export interface LeadPreview {
  projectId: string
  projectName: string
  folderPath: string
  prompt: string
  taskCount: number
  placeholderFound: boolean
}

// ---------------------------------------------------------------------------
// Gamification
// ---------------------------------------------------------------------------

export interface GamificationSummary {
  points: number
  level: number
  levelName: string
  nextLevelAt: number
  /** Nom du rang suivant — évite au front d'importer le catalogue serveur. */
  nextLevelName: string
  streak: number
  bestStreak: number
  doneToday: number
  scheduledToday: number
  /** 0 → 1 */
  completionRatio: number
}

// ---------------------------------------------------------------------------
// Apprentissage & Companion (V2)
// ---------------------------------------------------------------------------

export type LearningStatus = 'todo' | 'done'

export interface LearningCourseSummary {
  technology: string
  title: string
  status: LearningStatus
  /** ISO 8601 */
  created_at: string
  /** ISO 8601 */
  updated_at: string
  /** ISO 8601 — null tant que le statut est 'todo' */
  completed_at: string | null
}

export interface LearningCourse extends LearningCourseSummary {
  content_md: string
}

export type CompanionCommandKey = 'opencode:lead' | 'brain:scan' | 'brain:run'

export interface CompanionCommandPayload {
  folder_path?: string
  prompt?: string
  dev_root?: string
}

export interface CompanionCommand {
  id: string
  command_key: CompanionCommandKey
  payload: CompanionCommandPayload
  /** ISO 8601 */
  created_at: string
}

export interface CompanionStatus {
  available: boolean
  /** ISO 8601 */
  lastSeenAt: string | null
  reason: string | null
}

export interface CompanionClaimResult {
  commands: CompanionCommand[]
}

export interface BrainScanResult {
  dev_root: string
  added: number
  updated: number
  projects: string[]
  errors: string[]
}
