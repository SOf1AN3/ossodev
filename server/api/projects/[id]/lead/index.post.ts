import { notFound, requiredParam, runApi } from '~~/server/utils/http'
import {
  assertBridgeAllowed,
  copyToClipboard,
  openTerminalIn,
  writePromptFile,
} from '~~/server/utils/localBridge'
import type { TerminalLaunch } from '~~/server/utils/localBridge'
import { db } from '~~/db'
import { leadSessions } from '~~/db/schema'
import { getProject } from '~~/server/repositories/projects'
import { listTasks } from '~~/server/repositories/projectTasks'
import { getSettings } from '~~/server/repositories/settings'
import { renderLeadPrompt } from '~~/server/services/prompt'
import { parseUuidParam } from '~~/server/validation/projects'
import type { LeadPreview } from '~~/shared/types'

interface LeadLaunchResult {
  preview: LeadPreview
  file: string
  clipboardCopied: boolean
  terminal: TerminalLaunch
}

/**
 * POST /api/projects/:id/lead — lance réellement la session LEAD :
 * écrit `prompt.md`, copie le prompt, ouvre le terminal, journalise la session.
 */
export default defineEventHandler((event) =>
  runApi(event, async (): Promise<LeadLaunchResult> => {
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

    // 1. Écriture disque AVANT tout process (chemin validé par l'allowlist).
    const file = await writePromptFile(preview.folderPath, preview.prompt)
    // 2. Presse-papier : best effort, n'interrompt pas.
    const clipboardCopied = await copyToClipboard(preview.prompt).catch(() => false)
    // 3. Terminal : best effort, n'interrompt pas.
    const terminal = await openTerminalIn(preview.folderPath)
    // 4. Historique : best effort, un échec n'annule pas la session.
    try {
      await db
        .insert(leadSessions)
        .values({ project_id: projectId, prompt_snapshot: preview.prompt })
    } catch {
      // Journalisation ignorée en cas d'erreur DB.
    }

    return { preview, file, clipboardCopied, terminal }
  }),
)
