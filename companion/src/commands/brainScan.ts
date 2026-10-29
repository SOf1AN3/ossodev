/**
 * Commande `brain:scan` — LECTURE SEULE.
 *
 * Liste les sous-dossiers directs de `dev_root`, détecte les marqueurs de projet
 * puis renvoie le résultat à `/api/companion/brain-result`.
 * Aucune écriture, aucun déplacement sur le disque.
 */

import fs from 'node:fs/promises'
import path from 'node:path'
import type { BrainProject, BrainScanPayload } from '../api.ts'
import { errorMessage, type CompanionConfig } from '../config.ts'

/** Marqueurs de projet détectés dans un sous-dossier direct. */
const PROJECT_MARKERS = [
  '.git',
  'package.json',
  'Cargo.toml',
  'pyproject.toml',
  'go.mod',
  'composer.json',
  '.opencode',
] as const

async function isProjectFolder(folderPath: string): Promise<boolean> {
  for (const marker of PROJECT_MARKERS) {
    try {
      await fs.access(path.join(folderPath, marker))
      return true
    } catch {
      // Marqueur absent → on continue.
    }
  }
  return false
}

/** Scanne `dev_root` (lecture seule) et renvoie le payload à envoyer. */
export async function buildScanPayload(config: CompanionConfig): Promise<BrainScanPayload> {
  const devRoot = config.dev_root
  const errors: string[] = []
  const projects: BrainProject[] = []

  let entries
  try {
    entries = await fs.readdir(devRoot, { withFileTypes: true })
  } catch (error) {
    throw new Error(`Lecture de dev_root impossible (${devRoot}) : ${errorMessage(error)}`)
  }

  const folders = entries
    .filter((entry) => entry.isDirectory())
    .sort((a, b) => a.name.localeCompare(b.name, 'fr'))

  for (const folder of folders) {
    const folderPath = path.join(devRoot, folder.name)
    try {
      if (await isProjectFolder(folderPath)) {
        projects.push({ name: folder.name, folder_path: folderPath })
      }
    } catch (error) {
      // Un dossier illisible n'arrête pas le scan : on le remonte dans errors.
      errors.push(`${folder.name} : ${errorMessage(error)}`)
    }
  }

  return { dev_root: devRoot, projects, errors }
}
