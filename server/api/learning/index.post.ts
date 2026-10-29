import { readValid, runApi } from '~~/server/utils/http'
import { upsertCourse } from '~~/server/repositories/learning'
import { learningCourseCreateSchema } from '~~/server/validation/learning'

/** POST /api/learning — création / réédition d'un cours (upsert sur `technology`). */
export default defineEventHandler((event) =>
  runApi(event, async () => {
    const input = await readValid(learningCourseCreateSchema, event)
    return upsertCourse(input)
  }),
)
