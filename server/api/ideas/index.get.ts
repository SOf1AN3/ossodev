import { defineEventHandler } from 'h3'
import { runApi } from '~~/server/utils/http'
import { listIdeas } from '~~/server/repositories/ideas'

/** GET /api/ideas — liste des idées, les plus récentes en premier. */
export default defineEventHandler((event) =>
  runApi(event, async () => listIdeas()),
)
