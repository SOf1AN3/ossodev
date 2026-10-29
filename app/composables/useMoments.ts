import { type Ref } from 'vue'

export type ElementRef = Element | Ref<Element | null | undefined> | null | undefined

function resolve(el: ElementRef): Element | null {
  if (!el) return null
  if (el instanceof Element) return el
  return el.value ?? null
}

function reducedMotion(): boolean {
  if (!import.meta.client) return true
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

/** Retire proprement une classe d'animation après sa durée pour permettre un re-déclenchement. */
function pulse(el: Element | null, className: string, durationMs: number): void {
  if (!el) return
  el.classList.remove(className)
  /* forçage de reflow : garantit que l'animation repart de zéro */
  void (el as HTMLElement).offsetWidth
  el.classList.add(className)
  if (reducedMotion()) {
    el.classList.remove(className)
    return
  }
  window.setTimeout(() => el.classList.remove(className), durationMs)
}

/**
 * Les QUATRE MOMENTS de l'app.
 * Sobres au quotidien, émotion uniquement ici — jamais répétés.
 * Toute animation est neutralisée sous `prefers-reduced-motion`,
 * mais l'information (toast / texte) persiste toujours.
 */
export function useMoments() {
  /** ② Ignition d'un badge : halo ambre + scale + 3 braises qui montent. */
  function igniteBadge(el: ElementRef): void {
    pulse(resolve(el), 'igniting', 1000)
  }

  /** ③ Flare de flamme : l'icône s'ouvre d'un coup, le libellé reste immobile. */
  function flareFlame(el: ElementRef): void {
    pulse(resolve(el), 'flaring', 520)
  }

  /** ④ Balayage de la bande héro — appelé le jour où tout est bouclé. */
  function sweepHero(el: ElementRef): void {
    const target = resolve(el)
    if (!target) return
    target.classList.remove('hero-sweeping')
    void (target as HTMLElement).offsetWidth
    target.classList.add('hero-sweeping')
    if (reducedMotion()) {
      target.classList.remove('hero-sweeping')
      return
    }
    window.setTimeout(() => target.classList.remove('hero-sweeping'), 950)
  }

  /** Comptage animé d'un chiffre. Réduit en mode « peu de mouvement ». */
  function countUp(target: Ref<number> | null, to: number, ms = 450): void {
    if (!target) return
    if (reducedMotion()) {
      target.value = to
      return
    }
    const from = target.value
    if (from === to) return
    const start = performance.now()
    const step = (now: number): void => {
      const k = Math.min(1, (now - start) / ms)
      /* ease-out-exprès : rapide au départ, posé à l'arrivée */
      const eased = 1 - Math.pow(1 - k, 3)
      target.value = Math.round(from + (to - from) * eased)
      if (k < 1) requestAnimationFrame(step)
    }
    requestAnimationFrame(step)
  }

  return { igniteBadge, flareFlame, sweepHero, countUp, reducedMotion }
}
