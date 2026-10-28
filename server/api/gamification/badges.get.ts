import { defineEventHandler } from 'h3'
import { runApi } from '~~/server/utils/http'
import { evaluateBadges } from '~~/server/services/gamification'
import type { BadgeWithEarned } from '~~/server/services/gamification'

/** Tri : badges gagnés d'abord (par `earned_at` décroissant), puis non gagnés par `code`. */
function compareBadges(a: BadgeWithEarned, b: BadgeWithEarned): number {
  if (a.earned_at !== null && b.earned_at === null) return -1
  if (a.earned_at === null && b.earned_at !== null) return 1
  if (a.earned_at !== null && b.earned_at !== null && a.earned_at !== b.earned_at) {
    return a.earned_at < b.earned_at ? 1 : -1
  }
  return a.code < b.code ? -1 : a.code > b.code ? 1 : 0
}

/** GET /api/gamification/badges — catalogue complet, gagnés d'abord. */
export default defineEventHandler((event) =>
  runApi(event, async () => {
    const evaluation = await evaluateBadges()
    return [...evaluation.all].sort(compareBadges)
  }),
)
