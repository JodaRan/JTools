import { ref, type Ref } from 'vue'

/**
 * Ouverture de la palette « Ctrl+P ». L'état est posé au niveau du module,
 * comme pour le halo : le raccourci global l'ouvre, le composant la rend, et
 * ni l'un ni l'autre n'a besoin de connaître l'autre.
 */
const open = ref(false)

export function usePalette(): {
  open: Ref<boolean>
  toggle: () => void
  close: () => void
} {
  return {
    open,
    toggle: () => {
      open.value = !open.value
    },
    close: () => {
      open.value = false
    }
  }
}
