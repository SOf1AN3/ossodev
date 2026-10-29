/**
 * Tray Windows sans dépendance npm — icône `NotifyIcon` pilotée par PowerShell
 * (choix motivé dans le README : aucun paquet tray npm fiable et maintenu,
 * PLAN.md §0 autorise explicitement ce repli).
 *
 * Protocole :
 *   Node → disque : `%APPDATA%\osso-companion\status.txt` (statut affiché, écrit
 *        de façon atomique, relu par un timer PowerShell chaque seconde)
 *   PowerShell → Node : lignes `EVENT:open` / `EVENT:quit` sur stdout
 *   Node → PowerShell : `dispose()` tue le processus.
 *
 * Un échec du tray n'est jamais bloquant : la boucle de polling continue.
 */

import { spawn, type ChildProcess } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import readline from 'node:readline'
import { appDataDir, errorMessage, log } from './config.ts'

export interface TrayCallbacks {
  /** Clic sur « Ouvrir le dashboard ». */
  onOpenDashboard: () => void
  /** Clic sur « Quitter ». */
  onQuit: () => void
}

export interface TrayHandle {
  /** Met à jour le sous-menu « Statut » et l'infobulle. */
  updateStatus: (text: string) => void
  /** Ferme proprement l'icône de tray. */
  dispose: () => void
}

const MAX_STATUS_CHARS = 60

/**
 * Script PowerShell embarqué : icône + menu contextuel, sans fenêtre principale.
 * Encodé en UTF-16LE base64 (`-EncodedCommand`) → aucun problème de quoting.
 */
function buildTrayScript(stateFile: string): string {
  return `
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

$stateFile = '${stateFile.replace(/'/g, "''")}'
$parentPid = 0
try { $parentPid = [int]$env:OSO_PARENT_PID } catch { $parentPid = 0 }

function Test-ParentAlive {
  if ($parentPid -le 0) { return $true }
  $proc = Get-Process -Id $parentPid -ErrorAction SilentlyContinue
  return ($null -ne $proc)
}

$bmp = New-Object System.Drawing.Bitmap 16, 16
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.SmoothingMode = 'AntiAlias'
$g.Clear([System.Drawing.Color]::Transparent)
$brush = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(74, 222, 128))
$g.FillEllipse($brush, 1, 1, 14, 14)
$g.Dispose()
$hicon = $bmp.GetHicon()
$icon = [System.Drawing.Icon]::FromHandle($hicon)

$tray = New-Object System.Windows.Forms.NotifyIcon
$tray.Icon = $icon
$tray.Text = 'OSSO Companion'
$tray.Visible = $true

$menu = New-Object System.Windows.Forms.ContextMenuStrip
$itemOpen = $menu.Items.Add('Ouvrir le dashboard')
$itemStatus = New-Object System.Windows.Forms.ToolStripMenuItem 'Statut'
$statusLine = $itemStatus.DropDownItems.Add('Demarrage en cours...')
$statusLine.Enabled = $false
$menu.Items.Add((New-Object System.Windows.Forms.ToolStripSeparator)) | Out-Null
$itemQuit = $menu.Items.Add('Quitter')

$itemOpen.Add_Click({
  [Console]::Out.WriteLine('EVENT:open')
  [Console]::Out.Flush()
})
$itemQuit.Add_Click({
  [Console]::Out.WriteLine('EVENT:quit')
  [Console]::Out.Flush()
  $tray.Visible = $false
  [System.Windows.Forms.Application]::Exit()
})

$timer = New-Object System.Windows.Forms.Timer
$timer.Interval = 1000
$timer.Add_Tick({
  # Si le processus Node parent a disparu (kill brutal), on s'auto-supprime :
  # jamais de tray orphelin.
  if (-not (Test-ParentAlive)) {
    $tray.Visible = $false
    [System.Windows.Forms.Application]::Exit()
    return
  }
  if (Test-Path -LiteralPath $stateFile) {
    try {
      $text = ([System.IO.File]::ReadAllText($stateFile)).Trim()
      if ($text.Length -gt 0) {
        $statusLine.Text = $text
        $tip = 'OSSO Companion - ' + $text
        if ($tip.Length -gt 60) { $tip = $tip.Substring(0, 60) }
        $tray.Text = $tip
      }
    } catch { }
  }
})
$timer.Start()

[System.Windows.Forms.Application]::Run()
$tray.Visible = $false
$tray.Dispose()
`
}

export function startTray(callbacks: TrayCallbacks): TrayHandle {
  let statusFile: string
  try {
    statusFile = path.join(appDataDir(), 'status.txt')
  } catch (error) {
    log('ERROR', `Tray indisponible (dossier de config) : ${errorMessage(error)}`)
    return inertHandle()
  }

  let child: ChildProcess | null = null
  let disposed = false

  try {
    fs.mkdirSync(appDataDir(), { recursive: true })
    const script = buildTrayScript(statusFile)
    const encoded = Buffer.from(script, 'utf16le').toString('base64')
    child = spawn('powershell.exe', ['-NoProfile', '-WindowStyle', 'Hidden', '-EncodedCommand', encoded], {
      shell: false,
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, OSO_PARENT_PID: String(process.pid) },
    })
    child.on('error', (error) => {
      log('ERROR', `Tray PowerShell inaccessible : ${errorMessage(error)}`)
      child = null
    })
    child.on('exit', (code) => {
      if (disposed === false) {
        log('WARN', `Tray PowerShell terminé prématurément (code ${String(code)}) — le Companion continue sans icône.`)
      }
      child = null
    })

    if (child.stdout !== null) {
      const lines = readline.createInterface({ input: child.stdout })
      lines.on('line', (line) => {
        if (line === 'EVENT:open') {
          callbacks.onOpenDashboard()
        } else if (line === 'EVENT:quit') {
          callbacks.onQuit()
        }
      })
    }
    if (child.stderr !== null) {
      const errs = readline.createInterface({ input: child.stderr })
      errs.on('line', (line) => {
        const clean = line.trim()
        // PowerShell émet du CLIXML sur stderr quand les flux sont redirigés —
        // c'est du bruit, pas une erreur.
        if (clean.length > 0 && clean.includes('CLIXML') === false && clean.startsWith('#<') === false) {
          log('WARN', `Tray : ${clean}`)
        }
      })
    }
  } catch (error) {
    log('ERROR', `Démarrage du tray impossible : ${errorMessage(error)}`)
    child = null
  }

  return {
    updateStatus(text: string): void {
      if (disposed) return
      try {
        const clean = text.replace(/[\r\n]+/g, ' ').slice(0, MAX_STATUS_CHARS)
        const tmp = `${statusFile}.tmp`
        fs.writeFileSync(tmp, clean, 'utf8')
        fs.renameSync(tmp, statusFile)
      } catch (error) {
        log('WARN', `Mise à jour du statut tray impossible : ${errorMessage(error)}`)
      }
    },
    dispose(): void {
      if (disposed) return
      disposed = true
      if (child !== null) {
        try {
          child.kill()
        } catch (error) {
          log('WARN', `Fermeture du tray impossible : ${errorMessage(error)}`)
        }
      }
      try {
        fs.rmSync(statusFile, { force: true })
      } catch {
        // Nettoyage best effort.
      }
    },
  }
}

/** Handle sans effet (repli si le dossier de config est introuvable). */
function inertHandle(): TrayHandle {
  return {
    updateStatus: () => undefined,
    dispose: () => undefined,
  }
}
