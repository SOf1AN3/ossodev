import { defineEventHandler } from 'h3'
import { runApi } from '~~/server/utils/http'
import { computeSummary, evaluateBadges } from '~~/server/services/gamification'
import type { Badge, GamificationSummary } from '~~/shared/types'

/**
 * GET /api/gamification/summary
 * Résumé (points, niveau, streak, du jour) + badges évalués de façon idempotente
 * à la lecture. `newlyEarned` = badges NOUVELLEMENT gagnés par cet appel.
 */
export default defineEventHandler((event) =>
  runApi(event, async () => {
    const [summary, evaluation] = await Promise.all([computeSummary(), evaluateBadges()])

    return {
      ...summary,
      newlyEarned: evaluation.earned satisfies Badge[],
    } satisfies GamificationSummary & { newlyEarned: Badge[] }
  }),
)
