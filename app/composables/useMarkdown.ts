import {
  nextTick,
  onMounted,
  ref,
  toValue,
  watch,
  type MaybeRefOrGetter,
  type Ref,
} from 'vue'
import { marked } from 'marked'
import DOMPurify from 'dompurify'
import { useTheme } from './useTheme'

/** Section du sommaire : ancre slugifiée + libellé brut du `h2`. */
export interface CourseHeading {
  id: string
  text: string
}

interface RenderedCourse {
  html: string
  headings: CourseHeading[]
}

/**
 * DOMPurify : autorise explicitement `<pre class="mermaid">` (blocs de
 * diagramme, contenu texte échappé par `marked`) et `id` (ancres du
 * sommaire). Sans ces ajouts, la classe serait retirée et Mermaid ne
 * trouverait plus aucun bloc à rendre.
 */
const PURIFY_CONFIG: { ADD_TAGS: string[]; ADD_ATTR: string[] } = {
  ADD_TAGS: ['pre'],
  ADD_ATTR: ['class', 'id'],
}

const HTML_ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  '#39': "'",
  nbsp: ' ',
}

function decodeEntities(text: string): string {
  return text.replace(
    /&(amp|lt|gt|quot|#39|nbsp);/g,
    (match, name: string) => HTML_ENTITIES[name] ?? match,
  )
}

/** « Les bases de React » → « les-bases-de-react » (ancres URL sûres). */
function slugify(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

/**
 * Transforme les blocs ```` ```mermaid ```` en `<pre class="mermaid">` —
 * c'est le sélecteur que Mermaid cible au rendu. Le code reste échappé
 * dans le HTML : `textContent` le décode à la lecture.
 */
function toMermaidBlocks(html: string): string {
  return html.replace(
    /<pre><code class="language-mermaid">([\s\S]*?)<\/code><\/pre>/g,
    (_match, code: string) => `<pre class="mermaid">${code}</pre>`,
  )
}

/**
 * Pose un `id` slugifié sur chaque `h2` (avec `tabindex="-1"` pour le
 * focus programmatique du sommaire) et en extrait les entrées du TOC.
 */
function withHeadingIds(html: string): RenderedCourse {
  const headings: CourseHeading[] = []
  const used = new Map<string, number>()

  const withIds = html.replace(
    /<h2(\s[^>]*)?>([\s\S]*?)<\/h2>/g,
    (_match, attrs: string | undefined, inner: string) => {
      const text = decodeEntities(inner.replace(/<[^>]*>/g, '')).trim()
      const base = slugify(text) || 'section'
      const seen = used.get(base) ?? 0
      used.set(base, seen + 1)
      const id = seen === 0 ? base : `${base}-${seen + 1}`
      const keptAttrs = (attrs ?? '').replace(/\s*id="[^"]*"/g, '')
      headings.push({ id, text })
      return `<h2${keptAttrs} id="${id}" tabindex="-1">${inner}</h2>`
    },
  )

  return { html: withIds, headings }
}

/**
 * Retire le titre `# …` de tête du Markdown.
 *
 * La page de cours affiche **déjà** le titre en `<h1>` : laisser `marked`
 * rendre ce `# …` produisait **deux `h1`** (hiérarchie et titre de page
 * ambiguë). La spec Teacher impose ce titre en première ligne, donc on le
 * retire systématiquement — l'`h1` de la page reste le seul, quel que
 * soit le contenu.
 *
 * Seule la **première** ligne est touchée, et uniquement si c'est un H1 :
 * `# Titre` match, `## Section` et `#hashtag` non.
 */
function stripLeadingH1(md: string): string {
  const m = /^[ \t]*#[ \t]+[^\n]*\n?/.exec(md)
  return m === null ? md : md.slice(m[0].length).replace(/^[ \t*\n]+/, '')
}

/** Pipeline complet : titre de tête retiré → marked → Mermaid → DOMPurify → ancres `h2`. */
function renderCourse(md: string): RenderedCourse {
  const parsed = marked.parse(stripLeadingH1(md), { async: false })
  const withMermaid = toMermaidBlocks(parsed)
  const clean = DOMPurify.sanitize(withMermaid, PURIFY_CONFIG)
  return withHeadingIds(clean)
}

/**
 * Rend un Markdown de cours en HTML assaini.
 * **Côté client uniquement** : DOMPurify a besoin d'un DOM, et le rendu
 * d'un cours (comme Mermaid) ne se fait jamais pendant le SSR.
 */
export function renderMarkdown(md: string): string {
  if (!import.meta.client) return ''
  return renderCourse(md).html
}

/**
 * Cycle de vie du rendu d'un cours :
 * 1. HTML assaini recalculé à chaque changement de Markdown (client only) ;
 * 2. diagrammes Mermaid importés dynamiquement puis rendus dans les
 *    `<pre class="mermaid">` — échec = le code source reste affiché ;
 * 3. ré-édition complète des diagrammes à la bascule de thème.
 */
export function useCourseMarkdown(source: MaybeRefOrGetter<string>): {
  html: Ref<string>
  headings: Ref<CourseHeading[]>
  container: Ref<HTMLElement | null>
} {
  const html = ref('')
  const headings = ref<CourseHeading[]>([])
  const container = ref<HTMLElement | null>(null)
  const { theme } = useTheme()

  /** Compteur de passe : neutralise un rendu devenu obsolète (course/thème). */
  let diagramPass = 0

  function renderNow(): void {
    if (!import.meta.client) return
    const rendered = renderCourse(toValue(source))
    html.value = rendered.html
    headings.value = rendered.headings
  }

  async function renderDiagrams(): Promise<void> {
    const pass = ++diagramPass
    if (!import.meta.client) return
    // Laisse le v-html se peindre avant de chercher les blocs.
    await nextTick()
    if (pass !== diagramPass) return

    const root = container.value
    if (root === null) return
    const blocks = Array.from(
      root.querySelectorAll<HTMLElement>('pre.mermaid'),
    )
    if (blocks.length === 0) return

    // Import dynamique : Mermaid ne doit jamais figuer dans le bundle principal.
    const module = await import('mermaid').catch(() => null)
    if (module === null || pass !== diagramPass) return
    const mermaid = module.default

    mermaid.initialize({
      startOnLoad: false,
      theme: theme.value === 'light' ? 'neutral' : 'dark',
      securityLevel: 'strict',
    })

    for (let index = 0; index < blocks.length; index += 1) {
      if (pass !== diagramPass) return
      const block = blocks[index]
      if (block === undefined) continue

      // Source mémorisée : après rendu, le bloc ne contient plus que le SVG.
      const source = block.dataset['source'] ?? block.textContent ?? ''
      block.dataset['source'] = source
      const elementId = `osso-mermaid-${pass}-${index}`

      // Validation d'abord : un diagramme invalide ne doit jamais atteindre
      // `render` (qui, lui, journaliserait l'erreur en console).
      // `parse` renvoie `false` (suppressErrors) ou un ParseResult valide.
      let parsable = false
      try {
        const parsed = await mermaid.parse(source, { suppressErrors: true })
        parsable = parsed !== false
      } catch {
        parsable = false
      }
      if (pass !== diagramPass) return
      if (!parsable) {
        showSource(block, source)
        continue
      }

      try {
        const { svg } = await mermaid.render(elementId, source)
        if (pass !== diagramPass) return
        block.innerHTML = svg
      } catch {
        // Repli : le code source du diagramme reste lisible, la page tient.
        showSource(block, source)
      }
    }
  }

  // Le composant n'est monté qu'après le chargement client du cours (la page
  // affiche un squelette en SSR) : pas de mismatch d'hydratation possible.
  renderNow()

  onMounted(() => {
    void renderDiagrams()
  })

  // Nouveau Markdown (chargement, navigation) → pipeline complet.
  watch(
    () => toValue(source),
    () => {
      renderNow()
      void renderDiagrams()
    },
  )

  // Bascule de thème → seuls les diagrammes sont repeints.
  watch(theme, () => {
    void renderDiagrams()
  })

  return { html, headings, container }
}

/** Repli d'un diagramme illisible : on restitue sa source en `<pre>`. */
function showSource(block: HTMLElement, source: string): void {
  block.classList.remove('mermaid')
  block.textContent = source
}
