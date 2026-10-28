import { notFound, requiredParam, runApi } from '~~/server/utils/http'
import { assertBridgeAllowed } from '~~/server/utils/localBridge'
import { getProject } from '~~/server/repositories/projects'
import { listTasks } from '~~/server/repositories/projectTasks'
import { getSettings } from '~~/server/repositories/settings'
import { renderLeadPrompt } from '~~/server/services/prompt'
import { parseUuidParam } from '~~/server/validation/projects'
import type { LeadPreview } from '~~/shared/types'

/**
 * GET /api/projects/:id/lead/preview — aperçu du prompt LEAD.
 * Zéro side-effect : aucun écrit disque, presse-papier ni terminal.
 */
export default defineEventHandler((event) =>
  runApi(event, async () => {
    assertBridgeAllowed()

    const projectId = parseUuidParam(requiredParam(event, 'id'))
    const project = await getProject(projectId)
    if (!project) notFound('Projet')

    const tasks = await listTasks(projectId)
    const { leadIntroTemplate } = await getSettings()
    const rendered = renderLeadPrompt(leadIntroTemplate, {
      projectName: project.name,
      folderPath: project.folder_path,
      tasks,
    })

    const preview: LeadPreview = {
      projectId,
      projectName: project.name,
      folderPath: project.folder_path,
      prompt: rendered.prompt,
      taskCount: rendered.taskCount,
      placeholderFound: rendered.placeholderFound,
    }
    return preview
  }),
)
