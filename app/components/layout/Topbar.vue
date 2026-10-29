<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import type { CSSProperties } from 'vue'
import { useCompanion, companionReasonDetail } from '~/composables/useCompanion'

/** Mapping route → titre de page (fil d'Ariane). */
const PAGE_TITLES: Readonly<Record<string, string>> = {
  '/': 'Tableau de bord',
  '/aujourdhui': "Aujourd'hui",
  '/planifier': 'Planifier',
  '/routines': 'Routines',
  '/idees': 'Idées',
  '/projets': 'Projets',
  '/progres': 'Progrès',
  '/apprentissage': 'Apprentissage',
  '/reglages': 'Réglages',
}

const route = useRoute()
const { summary, load } = useGamification()
const { isLight, toggle, sync } = useTheme()
const {
  status: companionStatus,
  pending: companionPending,
  refresh: refreshCompanion,
} = useCompanion()

/** Titre de la page courante, déduit du chemin de la route. */
const pageTitle = computed<string>(() => PAGE_TITLES[route.path] ?? 'OSSO')

/** Compteur de série : 0 tant que le résumé n'est pas chargé. */
const streak = computed<number>(() => summary.value?.streak ?? 0)

// ─── Horloge d'instrument : mise à jour toutes les 15 s, jamais annoncée ──
// `null` au départ → rendu vide côté serveur ET au premier rendu client,
// donc aucun mismatch d'hydratation ; la date réelle n'est calculée qu'après montage.
const now = ref<Date | null>(null)
let clockTimer: ReturnType<typeof setInterval> | null = null

/** Format `JJ.MM · HH:MM` — chiffres tabulaires, pas de décalage au tick. */
const clockLabel = computed<string>(() => {
  const d = now.value
  if (d === null) return ''
  const day = String(d.getDate()).padStart(2, '0')
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const hours = String(d.getHours()).padStart(2, '0')
  const minutes = String(d.getMinutes()).padStart(2, '0')
  return `${day}.${month} · ${hours}:${minutes}`
})

// ─── Pastille Companion : présence à côté du compteur de série ─────────────

/** « vu il y a 12 s » / « jamais vu » — dernière présence en français. */
function formatLastSeen(iso: string | null): string {
  if (iso === null) return 'jamais vu'
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return 'date inconnue'
  const rtf = new Intl.RelativeTimeFormat('fr-FR', { numeric: 'auto' })
  // Dépend de `now` : le titre reste exact au tick de l'horloge (15 s).
  const reference = now.value ?? new Date()
  const diffSeconds = Math.round((date.getTime() - reference.getTime()) / 1000)
  if (Math.abs(diffSeconds) < 60) return `vu ${rtf.format(diffSeconds, 'second')}`
  const diffMinutes = Math.round(diffSeconds / 60)
  if (Math.abs(diffMinutes) < 60) return `vu ${rtf.format(diffMinutes, 'minute')}`
  const diffHours = Math.round(diffMinutes / 60)
  if (Math.abs(diffHours) < 24) return `vu ${rtf.format(diffHours, 'hour')}`
  return `vu ${rtf.format(Math.round(diffHours / 24), 'day')}`
}

/** Étiquette lue par les lecteurs d'écran (jamais de couleur seule). */
const companionAria = computed<string>(() => {
  const current = companionStatus.value
  if (current === null) {
    return companionPending.value
      ? 'Companion : vérification de la présence'
      : 'Companion : présence inconnue'
  }
  if (current.available) return 'Companion en ligne'
  const detail = companionReasonDetail(current.reason)
  return detail === null
    ? 'Companion hors ligne'
    : `Companion hors ligne — ${detail}`
})

/** Tooltip : dernière présence vu par le serveur. */
const companionTitle = computed<string>(() =>
  formatLastSeen(companionStatus.value?.lastSeenAt ?? null),
)

const companionDotClass = computed<string>(() => {
  if (companionStatus.value === null) return 'bg-ink-700'
  return companionStatus.value.available ? 'bg-ok-400' : 'bg-danger-400'
})

const companionDotStyle = computed<CSSProperties>(() => {
  const current = companionStatus.value
  if (current === null) return {}
  const colorVar = current.available ? '--color-ok-400' : '--color-danger-400'
  return { boxShadow: `0 0 8px 0 var(${colorVar})` }
})

// Rafraîchissement de la présence : la pastille doit suivre un Companion qui
// démarre ou s'arrête en cours de session. Un tick sur 4 (60 s) suffit — la
// présence serveur tombe à « hors ligne » au-delà de 45 s sans heartbeat.
const PRESENCE_TICKS = 4
let presenceTick = 0

onMounted(() => {
  // Synchronise l'état réactif avec le `data-theme` posé avant la première peinture.
  sync()
  // Garde anti-double-chargement côté store : aucun appel en double.
  void load()
  void refreshCompanion()
  now.value = new Date()
  clockTimer = setInterval(() => {
    now.value = new Date()
    presenceTick += 1
    if (presenceTick >= PRESENCE_TICKS) {
      presenceTick = 0
      // `force` : le garde `loaded` n'a plus lieu d'être après le 1er chargement.
      void refreshCompanion(true)
    }
  }, 15_000)
})

onUnmounted(() => {
  if (clockTimer !== null) {
    clearInterval(clockTimer)
    clockTimer = null
  }
})
</script>

<template>
  <header
    class="sticky top-0 z-40 flex h-14 items-center justify-between gap-4 border-b border-line bg-surface-950/85 px-8 backdrop-blur-xl"
  >
    <!-- Fil d'Ariane : titre de la page courante -->
    <nav aria-label="Fil d'Ariane" class="min-w-0">
      <p class="truncate text-[13px] text-ink-500" aria-current="page">
        {{ pageTitle }}
      </p>
    </nav>

    <!-- Instruments -->
    <div class="flex shrink-0 items-center gap-3">
      <!-- Horloge + date (masquée aux lecteurs d'écran : elle change sans action) -->
      <span
        class="font-mono text-[12px] text-ink-700 tnum"
        aria-hidden="true"
      >{{ clockLabel }}</span>

      <span class="h-3.5 w-px bg-line" aria-hidden="true" />

      <!-- Compteur de série -->
      <span class="flex items-center gap-1.5" title="Série en cours (jours consécutifs)">
        <UiIcon name="flame" class="h-[15px] w-[15px] text-accent-400" />
        <span class="font-mono text-sm font-bold text-ink-100 tnum">{{ streak }}</span>
      </span>

      <!-- Pastille Companion : le point porte l'info, le texte vit en aria + tooltip -->
      <span
        class="flex items-center"
        role="status"
        :aria-label="companionAria"
        :title="companionTitle"
      >
        <span
          class="h-[7px] w-[7px] rounded-full"
          :class="companionDotClass"
          :style="companionDotStyle"
          aria-hidden="true"
        />
      </span>

      <!-- Bascule de thème -->
      <button
        type="button"
        class="flex h-8 w-8 items-center justify-center rounded-sm border border-line text-ink-300 transition-colors hover:bg-surface-800 hover:text-ink-100"
        :aria-label="isLight ? 'Basculer en thème sombre' : 'Basculer en thème clair'"
        @click="toggle"
      >
        <UiIcon :name="isLight ? 'moon' : 'sun'" size="sm" />
      </button>
    </div>
  </header>
</template>
