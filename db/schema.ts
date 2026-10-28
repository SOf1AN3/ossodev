import { sql } from 'drizzle-orm'
import {
  boolean,
  check,
  date,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core'

/**
 * Contrat DB figé — voir PLAN.md §1.2.
 * Noms de propriétés en snake_case pour que `.$inferSelect` soit structurellement
 * identique aux types de `shared/types.ts` (aucun mapping nécessaire côté repositories).
 */

// Réglages clé/valeur (intro LEAD, commandes brain & terminal)
export const settings = pgTable('settings', {
  key: text('key').primaryKey(),
  value: jsonb('value').$type<unknown>().notNull(),
  updated_at: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
})

// Projets dev (alimentés par brain ou à la main)
export const projects = pgTable('projects', {
  id: uuid('id').defaultRandom().primaryKey(),
  name: text('name').notNull(),
  folder_path: text('folder_path').notNull().unique(),
  last_scan_at: timestamp('last_scan_at', { withTimezone: true }),
  is_archived: boolean('is_archived').notNull().default(false),
  created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
})

// Checklist ordonnée d'un projet dev
export const projectTasks = pgTable('project_tasks', {
  id: uuid('id').defaultRandom().primaryKey(),
  project_id: uuid('project_id')
    .notNull()
    .references(() => projects.id, { onDelete: 'cascade' }),
  title: text('title').notNull(),
  position: integer('position').notNull(),
  is_done: boolean('is_done').notNull().default(false),
  created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updated_at: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index('idx_project_tasks_project').on(t.project_id, t.position),
])

// Gabarits de tâches répétitives
export const routines = pgTable('routines', {
  id: uuid('id').defaultRandom().primaryKey(),
  title: text('title').notNull(),
  frequency: text('frequency').notNull(),
  // 0=dimanche … 6=samedi ; NULL si daily
  weekdays: integer('weekdays').array(),
  points: integer('points').notNull().default(10),
  is_active: boolean('is_active').notNull().default(true),
  start_date: date('start_date').notNull().default(sql`CURRENT_DATE`),
  created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updated_at: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  check('routines_frequency_check', sql`${t.frequency} in ('daily', 'weekly')`),
])

// Tâches perso (one-off OU instance de routine)
export const tasks = pgTable('tasks', {
  id: uuid('id').defaultRandom().primaryKey(),
  title: text('title').notNull(),
  notes: text('notes'),
  status: text('status').notNull().default('todo'),
  // 1 haute · 2 normale · 3 basse
  priority: integer('priority').notNull().default(2),
  source: text('source').notNull().default('oneoff'),
  scheduled_date: date('scheduled_date').notNull(),
  routine_id: uuid('routine_id').references(() => routines.id, { onDelete: 'set null' }),
  points: integer('points').notNull().default(10),
  completed_at: timestamp('completed_at', { withTimezone: true }),
  created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updated_at: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  check('tasks_status_check', sql`${t.status} in ('todo', 'doing', 'done')`),
  check('tasks_source_check', sql`${t.source} in ('oneoff', 'routine')`),
  // Idempotence : une routine ne génère qu'UNE instance par jour
  uniqueIndex('uniq_routine_instance')
    .on(t.routine_id, t.scheduled_date)
    .where(sql`${t.routine_id} is not null`),
  index('idx_tasks_scheduled').on(t.scheduled_date),
  index('idx_tasks_status').on(t.status),
])

// Inbox d'idées
export const ideas = pgTable('ideas', {
  id: uuid('id').defaultRandom().primaryKey(),
  title: text('title').notNull(),
  description: text('description'),
  created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
})

// Mission hebdomadaire (gamification V2)
export const weeklyMissions = pgTable('weekly_missions', {
  id: uuid('id').defaultRandom().primaryKey(),
  // lundi de la semaine
  week_start: date('week_start').notNull(),
  title: text('title').notNull(),
  target: integer('target').notNull(),
  created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  unique('uniq_weekly_missions_week_start').on(t.week_start),
])

// Catalogue de badges (seedé en migration)
export const badges = pgTable('badges', {
  code: text('code').primaryKey(),
  name: text('name').notNull(),
  description: text('description').notNull(),
  icon: text('icon').notNull(),
})

// Badges obtenus
export const userBadges = pgTable('user_badges', {
  id: uuid('id').defaultRandom().primaryKey(),
  badge_code: text('badge_code')
    .notNull()
    .references(() => badges.code, { onDelete: 'cascade' }),
  earned_at: timestamp('earned_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  unique('uniq_user_badges_badge_code').on(t.badge_code),
])

// Journal des sessions LEAD lancées
export const leadSessions = pgTable('lead_sessions', {
  id: uuid('id').defaultRandom().primaryKey(),
  project_id: uuid('project_id')
    .notNull()
    .references(() => projects.id, { onDelete: 'cascade' }),
  prompt_snapshot: text('prompt_snapshot').notNull(),
  launched_at: timestamp('launched_at', { withTimezone: true }).defaultNow().notNull(),
})

export const schema = {
  settings,
  projects,
  projectTasks,
  routines,
  tasks,
  ideas,
  weeklyMissions,
  badges,
  userBadges,
  leadSessions,
}

export type Schema = typeof schema
