<script setup lang="ts">
import { useCourseMarkdown, type CourseHeading } from '~/composables/useMarkdown'

interface CourseBodyProps {
  /** Markdown complet du cours (`content_md`). */
  md: string
}

const props = defineProps<CourseBodyProps>()

const emit = defineEmits<{
  /** Remonte les sections `h2` (ancres slugifiées) pour le sommaire. */
  headings: [CourseHeading[]]
}>()

const { html, headings, container } = useCourseMarkdown(() => props.md)

watch(
  headings,
  (value) => {
    emit('headings', value)
  },
  { immediate: true },
)
</script>

<template>
  <!-- v-html est assaini en amont par DOMPurify (useMarkdown) — jamais brut. -->
  <div ref="container" class="course" v-html="html" />
</template>

<style>
/* ══════════════════════════════════════════════════════════════
   COURS RENDU — styles ciblés sur `.course`, jamais réécrits dans
   le Markdown. Même hiérarchie typographique que le dashboard.
   ══════════════════════════════════════════════════════════════ */

/* Smooth scroll des ancres du sommaire, limité aux pages de cours. */
html:has(.course) {
  scroll-behavior: smooth;
}

.course h2 {
  font-size: var(--text-xl);
  font-weight: 600;
  color: var(--color-ink-100);
  margin-top: 2.5rem;
  margin-bottom: 1rem;
  /* Ne passe pas sous la topbar sticky (56px) + marge. */
  scroll-margin-top: 5rem;
}

.course h3 {
  font-size: var(--text-lg);
  font-weight: 600;
  color: var(--color-ink-100);
  margin-top: 2rem;
  margin-bottom: 0.75rem;
  scroll-margin-top: 5rem;
}

.course h4,
.course h5,
.course h6 {
  font-size: var(--text-md);
  font-weight: 600;
  color: var(--color-ink-100);
  margin-top: 1.5rem;
  margin-bottom: 0.5rem;
  scroll-margin-top: 5rem;
}

.course p {
  color: var(--color-ink-300);
  line-height: 1.625;
  margin-bottom: 1rem;
}

.course ul,
.course ol {
  color: var(--color-ink-300);
  padding-left: 1.5rem;
  margin-bottom: 1rem;
}

.course ul {
  list-style-type: disc;
}

.course ol {
  list-style-type: decimal;
}

.course li + li {
  margin-top: 0.5rem;
}

.course li {
  line-height: 1.625;
}

.course :not(pre) > code {
  font-family: var(--font-mono);
  font-size: 13px;
  background: var(--color-surface-800);
  padding: 2px 6px;
  border-radius: var(--radius-xs);
  color: var(--color-accent-400);
}

.course pre {
  background: var(--color-surface-800);
  border: 1px solid var(--color-line);
  border-radius: var(--radius-sm);
  padding: 1rem;
  overflow-x: auto;
  font-family: var(--font-mono);
  font-size: 13px;
  color: var(--color-ink-100);
  margin-bottom: 1.5rem;
}

.course pre code {
  background: none;
  padding: 0;
  border-radius: 0;
  color: inherit;
  font-size: inherit;
}

/* Diagramme Mermaid : même base que `pre`, centré. */
.course pre.mermaid {
  text-align: center;
}

.course pre.mermaid svg {
  margin: 0 auto;
  max-width: 100%;
  height: auto;
}

.course blockquote {
  border-left: 2px solid var(--color-accent-400);
  padding-left: 1rem;
  color: var(--color-ink-500);
  font-style: italic;
  margin-bottom: 1rem;
}

.course table {
  width: 100%;
  font-size: var(--text-sm);
  border-collapse: collapse;
  margin-bottom: 1.5rem;
}

.course th {
  font-size: var(--text-micro);
  line-height: 1.4;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  font-weight: 600;
  color: var(--color-ink-500);
  border-bottom: 1px solid var(--color-line);
  text-align: left;
  padding: 0.5rem 1rem 0.5rem 0;
}

.course td {
  color: var(--color-ink-300);
  border-bottom: 1px solid var(--color-line);
  padding: 0.5rem 1rem 0.5rem 0;
}

.course a {
  color: var(--color-accent-400);
  text-underline-offset: 4px;
}

.course a:hover {
  color: var(--color-ink-100);
}

.course img {
  max-width: 100%;
  border-radius: var(--radius-sm);
}
</style>
