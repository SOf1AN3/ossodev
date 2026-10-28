/**
 * Modèles de prompt LEAD — rendu pur, aucun accès disque, aucun process.
 */

/** Tâche minimale nécessaire au rendu (compatible `ProjectTask` et lignes Drizzle). */
export interface LeadTaskItem {
  title: string
  is_done: boolean
}

export const DEFAULT_LEAD_TEMPLATE = `Tu interviens en tant que LEAD sur le projet **{{PROJET}}** (dossier \`{{DOSSIER}}\`).

Ta mission : traiter la liste de tâches suivante, **dans l'ordre**, jusqu'à completion complète.
Ne saute aucune tâche. Pour chacune : comprendre le besoin, implémenter, tester, puis passer à la suivante.

## Tâches à traiter

{{TACHES}}

## Règles
- Une tâche à la fois. Pas de travail en parallèle.
- Annonce clairement la fin de chaque tâche avant de passer à la suivante.
- Si une tâche est bloquée ou ambiguë, signale-la et passe à la suivante.
- Termine par un bilan : terminées, en cours, bloquées.`

export interface LeadPromptInput {
  projectName: string
  folderPath: string
  tasks: LeadTaskItem[]
}

export interface LeadPromptResult {
  prompt: string
  taskCount: number
  placeholderFound: boolean
}

/** Échappe les caractères markdown significatifs d'un titre (une seule passe). */
function escapeMarkdown(title: string): string {
  return title.replace(/([\\*_#`])/g, '\\$1')
}

/**
 * Liste markdown numérotée : tâches non faites d'abord, puis faites,
 * chacune avec sa position d'origine (1-based) et sa case à cocher.
 */
function renderTasksBlock(tasks: LeadTaskItem[]): string {
  if (tasks.length === 0) return '_Aucune tâche dans ce projet pour l\'instant._'

  const indexed = tasks.map((task, index) => ({ task, original: index + 1 }))
  const ordered = [
    ...indexed.filter((item) => !item.task.is_done),
    ...indexed.filter((item) => item.task.is_done),
  ]

  return ordered
    .map((item) => {
      const box = item.task.is_done ? 'x' : ' '
      return `- [${box}] ${item.original}. ${escapeMarkdown(item.task.title)}`
    })
    .join('\n')
}

/**
 * Rend le prompt LEAD à partir d'un gabarit.
 * - remplace `{{PROJET}}`, `{{DOSSIER}}` et `{{TACHES}}` ;
 * - si `{{TACHES}}` est absent du gabarit, la liste est appendée en fin
 *   après un saut de ligne et un séparateur `---`.
 */
export function renderLeadPrompt(template: string, input: LeadPromptInput): LeadPromptResult {
  const placeholderFound = template.includes('{{TACHES}}')
  const tasksBlock = renderTasksBlock(input.tasks)

  const base = template
    .split('{{PROJET}}').join(input.projectName)
    .split('{{DOSSIER}}').join(input.folderPath)

  const prompt = placeholderFound
    ? base.split('{{TACHES}}').join(tasksBlock)
    : appendTasks(base, tasksBlock)

  return { prompt, taskCount: input.tasks.length, placeholderFound }
}

function appendTasks(base: string, tasksBlock: string): string {
  const head = base.trimEnd()
  if (head.length === 0) return tasksBlock
  return `${head}\n\n---\n\n${tasksBlock}`
}
