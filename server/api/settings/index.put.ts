import { readValid, runApi } from '~~/server/utils/http'
import { saveSettings } from '~~/server/repositories/settings'
import { settingsUpdateSchema } from '~~/server/validation/settings'

/** PUT /api/settings — mise à jour partielle validée puis relecture complète. */
export default defineEventHandler((event) =>
  runApi(event, async () => {
    const patch = await readValid(settingsUpdateSchema, event)
    return saveSettings(patch)
  }),
)
