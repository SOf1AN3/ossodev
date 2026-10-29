import { notFound, requiredParam, runApi } from '~~/server/utils/http'
import { assertSafeAbsolutePath } from '~~/server/utils/localBridge'
import { db } from '~~/db'
import { leadSessions } from '~~/db/schema'
import { getProject } from '~~/server/repositories/projects'
import { listTasks } from '~~/server/repositories/projectTasks'
import { getSettings } from '~~/server/repositories/settings'
import { renderLeadPrompt } from '~~/server/services/prompt'
import { enqueueCommand } from '~~/server/services/localBridge'
import { parseUuidParam } from '~~/server/validation/projects'
import type { LeadPreview } from '~~/shared/types'

interface LeadLaunchResult {
  preview: LeadPreview
  command_id: string
  status: 'pending'
}

/**
 * POST /api/projects/:id/lead — met en file la session LEAD.
 * Valide le chemin (`assertSafeAbsolutePath`) → rend le prompt →
 * `enqueueCommand('opencode:lead', { folder_path, prompt })`.
 * **N'écrit plus `prompt.md`, n'ouvre plus de terminal, ne touche plus au
 * presse-papier** : le Companion exécute tout sur le poste local.
 * Journalisation `lead_sessions` en best effort (un échec n'annule pas la mise en file).
 */
export default defineEventHandler((event) =>
  runApi(event, async (): Promise<LeadLaunchResult> => {
    const projectId = parseUuidParam(requiredParam(event, 'id'))
    const project = await getProject(projectId)
    if (!project) notFound('Projet')

    // Contrainte d'intégrité du chemin — active même Companion hors ligne.
    const folderPath = assertSafeAbsolutePath(project.folder_path)

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

    const enqueued = await enqueueCommand('opencode:lead', {
      folder_path: folderPath,
      prompt: rendered.prompt,
    })

    // Historique : best effort, un échec DB n'annule pas la session.
    try {
      await db
        .insert(leadSessions)
        .values({ project_id: projectId, prompt_snapshot: preview.prompt })
    } catch {
      // Journalisation ignorée en cas d'erreur DB.
    }

    return {
      preview,
      command_id: enqueued.command_id,
      status: enqueued.status,
    }
  }),
)
