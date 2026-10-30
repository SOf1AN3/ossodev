import { ref } from 'vue'
import type { Ref } from 'vue'

// Store réactif partagé (module-scope), même technique que useToast.ts :
// le bouton hamburger (Topbar) et le tiroir (layout) ne sont pas dans le même
// sous-arbre Vue — un ref local ne suffirait pas à les relier.
const isOpen = ref(false)

export function useMobileNav(): {
  isOpen: Ref<boolean>
  open: () => void
  close: () => void
  toggle: () => void
} {
  function open(): void {
    isOpen.value = true
  }

  function close(): void {
    isOpen.value = false
  }

  function toggle(): void {
    isOpen.value = !isOpen.value
  }

  return { isOpen, open, close, toggle }
}
