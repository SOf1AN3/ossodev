<script setup lang="ts">
// Pas de `defineProps` ici : en Vue 3, `class` (et `style`) passés par le
// parent tombent dans les « fallthrough attributes » et sont **fusionnés**
// automatiquement sur l'élément racine. Déclarer `class` comme prop oblige
// ensuite à écrire `:class="class"` — syntaxe invalide pour un parser, car
// `class` est un mot réservé JS.
// Voir : https://vuejs.org/guide/extras/render-function.html#fallthrough-attributes
</script>

<template>
  <!-- Balayage lumineux (.skel), jamais une pulsation d'opacité -->
  <div class="skel rounded-xs" aria-hidden="true" />
</template>
