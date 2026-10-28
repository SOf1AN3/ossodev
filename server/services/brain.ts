/**
 * Service « brain » — scan en lecture seule du dossier dev et exécution
 * de la commande brain configurée.
 *
 * ⚠️ `scanDevRoot` est STRICTEMENT en lecture : `readdir`, `existsSync`,
 * rien d'autre sur le disque. Aucun déplacement, suppression ou renommage.
 */
import { existsSync } from 'node:fs'
import { readdir } from 'node:fs/promises'
import path from 'node:path'
import { assertBridgeAllowed, runProcess } from '~~/server/utils/localBridge'
import { getSettings } from '~~/server/repositories/settings'
import { listProjects, upsertProjectByPath } from '~~/server/repositories/projects'

/** Marqueurs d'un dossier projet : au moins un doit être présent. */
const PROJECT_MARKERS = [
  '.git',
  'package.json',
  'Cargo.toml',
  'pyproject.toml',
  'go.mod',
  'composer.json',
  '.opencode',
] as const

export interface ScanReport {
  devRoot: string | null
  scanned: number
  detected: number
  added: number
  updated: number
  projects: string[]
  errors: string[]
}

export interface BrainRunResult {
  ran: boolean
  command: string
  exitCode: number | null
  stdout: string
  stderr: string
  message: string
}

function describeError(e: unknown): string {
  if (e instanceof Error) {
    const code = (e as NodeJS.ErrnoException).code
    return code ? `erreur ${code}` : 'erreur inconnue'
  }
  return 'erreur inconnue'
}

function readDevRoot(): string {
  const config = useRuntimeConfig()
  return typeof config.devRootPath === 'string' ? config.devRootPath : ''
}

/**
 * Scan en lecture seule de la racine dev : liste les sous-dossiers directs,
 * détecte ceux qui contiennent au moins un marqueur de projet, puis les
 * upsert en base (`name` + `last_scan_at`, tâches jamais touchées).
 * Chaque erreur est capturée sans interrompre le scan des autres dossiers.
 */
export async function scanDevRoot(): Promise<ScanReport> {
  const devRootPath = readDevRoot()
  const report: ScanReport = {
    devRoot: devRootPath.trim().length > 0 ? devRootPath : null,
    scanned: 0,
    detected: 0,
    added: 0,
    updated: 0,
    projects: [],
    errors: [],
  }

  if (report.devRoot === null) {
    report.errors.push('Racine du dossier dev non configurée (variable NUXT_DEV_ROOT_PATH).')
    return report
  }
  if (!existsSync(report.devRoot)) {
    report.errors.push(`Le dossier dev est introuvable : ${report.devRoot}`)
    return report
  }

  const entries = await readdir(report.devRoot, { withFileTypes: true }).catch((e: unknown) => {
    report.errors.push(`Lecture du dossier dev impossible : ${describeError(e)}.`)
    return null
  })
  if (entries === null) return report

  // Sous-dossiers directs uniquement — les liens symboliques sont écartés
  // (pas de suivi possible vers l'extérieur de la racine dev).
  const folders = entries.filter((entry) => entry.isDirectory())

  // Distingué créations / mises à jour. En cas d'échec DB, le scan continue
  // et chaque upsert individuel signalera sa propre erreur.
  let known = new Set<string>()
  try {
    const existing = await listProjects({ includeArchived: true })
    known = new Set(existing.map((project) => project.folder_path))
  } catch {
    report.errors.push('Lecture des projets existants impossible : base de données injoignable.')
  }

  for (const entry of folders) {
    const absolutePath = path.resolve(report.devRoot, entry.name)
    report.scanned += 1
    try {
      const isProject = PROJECT_MARKERS.some((marker) => existsSync(path.join(absolutePath, marker)))
      if (!isProject) continue

      const alreadyKnown = known.has(absolutePath)
      await upsertProjectByPath(entry.name, absolutePath)

      report.detected += 1
      if (alreadyKnown) {
        report.updated += 1
      } else {
        report.added += 1
      }
      report.projects.push(entry.name)
    } catch (e: unknown) {
      report.errors.push(`Dossier « ${entry.name} » ignoré : ${describeError(e)}.`)
    }
  }

  return report
}

/**
 * Exécute la commande brain configurée à la racine du dossier dev.
 * La commande est décomposée en fichier + arguments (split sur espaces),
 * jamais via un shell. Toute exception devient un résultat structuré.
 */
export async function runBrainCommand(): Promise<BrainRunResult> {
  assertBridgeAllowed()

  try {
    const { brainCommand } = await getSettings()
    const trimmed = brainCommand.trim()

    const devRoot = readDevRoot()
    const suggested = devRoot.trim().length > 0 ? `cd /d "${devRoot}" && opencode` : 'opencode'

    if (trimmed.length === 0) {
      return {
        ran: false,
        command: suggested,
        exitCode: null,
        stdout: '',
        stderr: '',
        message: 'Aucune commande brain configurée — définissez-la dans Réglages (elle s’exécute à la racine du dossier dev).',
      }
    }

    const parts = trimmed.split(/\s+/).filter((part) => part.length > 0)
    const file = parts[0]
    if (file === undefined || file.length === 0) {
      return {
        ran: false,
        command: suggested,
        exitCode: null,
        stdout: '',
        stderr: '',
        message: 'Aucune commande brain configurée — définissez-la dans Réglages (elle s’exécute à la racine du dossier dev).',
      }
    }

    const result = await runProcess(file, parts.slice(1), { cwd: devRoot })
    return {
      ran: true,
      command: trimmed,
      exitCode: result.code,
      stdout: result.stdout,
      stderr: result.stderr,
      message: result.code === 0
        ? 'Commande brain exécutée avec succès.'
        : `La commande brain s’est terminée avec le code ${result.code ?? 'inconnu'}.`,
    }
  } catch (e: unknown) {
    const detail = e instanceof Error ? e.message : 'erreur inconnue.'
    return {
      ran: false,
      command: '',
      exitCode: null,
      stdout: '',
      stderr: '',
      message: `Échec de la commande brain : ${detail}`,
    }
  }
}
