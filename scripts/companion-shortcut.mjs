/**
 * Pose (ou retire) un raccourci « OSSO Companion » sur le Bureau, pour lancer
 * le Companion à la demande.
 *
 *   node scripts/companion-shortcut.mjs           # créer
 *   node scripts/companion-shortcut.mjs --remove  # retirer
 *
 * Chaîne d'exécution :
 *   Bureau/OSSO Companion.lnk  →  wscript.exe  →  launch.vbs  (fenêtre cachée)
 *                                    └→ powershell → start.ps1  →  node
 *
 * Le `.lnk` ne pointe jamais directement vers PowerShell : il casserait le
 * raccourci avec une console visible. C'est le `.vbs` qui porte le lancement
 * caché (`WScript.Shell.Run(cmd, 0, False)`), exactement comme au démarrage
 * automatique — les deux partagent la même logique.
 *
 * L'icône est **générée** (cercle vert `#4ADE80`, celui du tray) en PNG inclus
 * dans un conteneur ICO : Windows Vista+ accepte le PNG, ce qui évite d'avoir
 * à fabriquer un BMP 32 bits à la main. Aucun binaire n'est versionné.
 *
 * Le chemin du Bureau est résolu par PowerShell
 * (`[Environment]::GetFolderPath('Desktop')`) : il reste correct si le Bureau
 * est redirigé vers OneDrive.
 */
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { deflateSync, crc32 } from 'node:zlib'

const DATA_DIR = join(process.env.APPDATA ?? '', 'osso-companion')
const START_PS1 = join(DATA_DIR, 'start.ps1')
const LAUNCH_VBS = join(DATA_DIR, 'launch.vbs')
const ICON_ICO = join(DATA_DIR, 'icon.ico')
const SHORTCUT_NAME = 'OSSO Companion.lnk'

/** Couleur du tray : `SolidBrush(FromArgb(74, 222, 128))`. */
const ROUGE = 74
const VERT = 222
const BLEU = 128

/* ══ Génération PNG ══════════════════════════════════════════════════════ */

/** Chunk PNG = longueur + type + données + CRC32(type + données). */
function pngChunk(type, data) {
  const typeBuf = Buffer.from(type, 'ascii')
  const longueur = Buffer.alloc(4)
  longueur.writeUInt32BE(data.length, 0)
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])) >>> 0, 0)
  return Buffer.concat([longueur, typeBuf, data, crc])
}

/**
 * Cercle vert antialiasé sur fond transparent, en RGBA brut (filtre 0 par
 * ligne de balayage, exigé par le format PNG).
 */
function cercleRgba(taille) {
  const centre = (taille - 1) / 2
  const rayon = taille * 0.46
  const pixels = Buffer.alloc(taille * taille * 4)
  for (let y = 0; y < taille; y++) {
    for (let x = 0; x < taille; x++) {
      const dx = x - centre
      const dy = y - centre
      const d = Math.sqrt(dx * dx + dy * dy)
      // Fondu de 1,5 px : pas de dents de scie sur le bord.
      const alpha = Math.max(0, Math.min(1, rayon - d + 0.75))
      const i = (y * taille + x) * 4
      pixels[i] = ROUGE
      pixels[i + 1] = VERT
      pixels[i + 2] = BLEU
      pixels[i + 3] = Math.round(alpha * 255)
    }
  }
  return pixels
}

function construirePng(taille) {
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(taille, 0)
  ihdr.writeUInt32BE(taille, 4)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 6 // color type RGBA
  // compression 0, filter 0, interlace 0 déjà à zéro

  const brut = cercleRgba(taille)
  const lignes = Buffer.alloc(taille * (taille * 4 + 1))
  for (let y = 0; y < taille; y++) {
    const debut = y * (taille * 4 + 1)
    lignes[debut] = 0 // filtre « none »
    brut.copy(lignes, debut + 1, y * taille * 4, (y + 1) * taille * 4)
  }

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', deflateSync(lignes, { level: 9 })),
    pngChunk('IEND', Buffer.alloc(0)),
  ])
}

/** Conteneur ICO à entrée unique, image PNG compressée. */
function construireIco(taille, png) {
  const entete = Buffer.alloc(6)
  entete.writeUInt16LE(0, 0) // réservé
  entete.writeUInt16LE(1, 2) // type : icône
  entete.writeUInt16LE(1, 4) // une seule image

  const entree = Buffer.alloc(16)
  entree[0] = taille >= 256 ? 0 : taille // 0 = 256
  entree[1] = taille >= 256 ? 0 : taille
  entree[2] = 0 // couleurs : palette
  entree[3] = 0
  entree.writeUInt16LE(1, 4) // planes
  entree.writeUInt16LE(32, 6) // bits/pixel
  entree.writeUInt32LE(png.length, 8)
  entree.writeUInt32LE(6 + 16, 12) // décalage : juste après l'en-tête

  return Buffer.concat([entete, entree, png])
}

/* ══ Fichiers locaux ═════════════════════════════════════════════════════ */

function ecrireFichiers() {
  mkdirSync(DATA_DIR, { recursive: true })

  if (!existsSync(START_PS1)) {
    console.warn(`⚠ Introuvable : ${START_PS1}`)
    console.warn('  Lance d’abord « node scripts/companion-autostart.mjs » qui le génère.')
    process.exit(1)
  }

  const commande = `powershell.exe -NoProfile -WindowStyle Hidden -File "${START_PS1}"`
  writeFileSync(
    LAUNCH_VBS,
    [
      "' OSSO Companion — lancement à la demande, fenêtre cachée.",
      'Set sh = CreateObject("WScript.Shell")',
      `sh.Run "${commande.replace(/"/g, '""')}", 0, False`,
      '',
    ].join('\r\n'),
    'utf8',
  )

  const taille = 256
  writeFileSync(ICON_ICO, construireIco(taille, construirePng(taille)), 'binary')
}

/* ══ Raccourci Bureau (via PowerShell) ═══════════════════════════════════ */

/**
 * PowerShell crée le `.lnk` : il résout lui-même le dossier Bureau (OneDrive
 * compris) et utilise `WScript.Shell` pour les propriétés du raccourci.
 * Les chemins passent par l'environnement — aucune chaîne à échapper.
 */
function executerPowerShell(mode) {
  const script = `
$ErrorActionPreference = 'Stop'
$desktop = [Environment]::GetFolderPath('Desktop')
$lnk = Join-Path $desktop '${SHORTCUT_NAME}'
if ('${mode}' -eq 'remove') {
  if (Test-Path -LiteralPath $lnk) { Remove-Item -LiteralPath $lnk -Force; Write-Output "REMOVED|$lnk" }
  else { Write-Output "ABSENT|$lnk" }
} else {
  $sh = New-Object -ComObject WScript.Shell
  $s = $sh.CreateShortcut($lnk)
  $s.TargetPath = (Join-Path $env:SystemRoot 'System32\\wscript.exe')
  $s.Arguments = '"' + $env:OSO_VBS + '"'
  $s.IconLocation = $env:OSO_ICO + ',0'
  $s.Description = 'Lancer le Companion OSSO'
  $s.WorkingDirectory = $env:OSO_WORKDIR
  $s.Save()
  Write-Output "CREATED|$lnk"
}`

  const encoded = Buffer.from(script, 'utf16le').toString('base64')
  return spawnSync(
    'powershell.exe',
    ['-NoProfile', '-NonInteractive', '-EncodedCommand', encoded],
    {
      encoding: 'utf8',
      windowsHide: true,
      env: {
        ...process.env,
        OSO_VBS: LAUNCH_VBS,
        OSO_ICO: ICON_ICO,
        OSO_WORKDIR: DATA_DIR,
      },
    },
  )
}

/* ══ Principal ═══════════════════════════════════════════════════════════ */

const retirer = process.argv.includes('--remove')

if (retirer) {
  const res = executerPowerShell('remove')
  const ligne = (res.stdout || '').trim()
  if (res.status !== 0) {
    console.error('✖ Échec du retrait du raccourci.')
    console.error((res.stderr || '').trim())
    process.exitCode = 1
  } else if (ligne.startsWith('REMOVED|')) {
    console.log(`✔ Retiré : ${ligne.slice('REMOVED|'.length)}`)
  } else {
    console.log(`· Rien à retirer (${SHORTCUT_NAME} absent du Bureau).`)
  }
  process.exit(0)
}

ecrireFichiers()

const res = executerPowerShell('create')
const ligne = (res.stdout || '').trim()

if (res.status !== 0 || !ligne.startsWith('CREATED|')) {
  console.error('✖ Échec de la création du raccourci.')
  console.error((res.stderr || '').trim() || ligne)
  process.exitCode = 1
} else {
  console.log('✔ Raccourci posé sur le Bureau.')
  console.log(`  ${ligne.slice('CREATED|'.length)}`)
  console.log(`  Icône : ${ICON_ICO} (cercle vert du tray, 256×256)`)
  console.log(`  Cible : ${LAUNCH_VBS} → fenêtre cachée`)
  console.log('\nDouble-clique pour lancer le Companion. Pour retirer :')
  console.log('  node scripts/companion-shortcut.mjs --remove')
}
