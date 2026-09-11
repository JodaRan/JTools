import { computed, ref, type ComputedRef, type Ref } from 'vue'

/**
 * Recherche de mots posée sur une liste — projets ou séquences. Les deux vues
 * qui s'en servent partagent la même question : que montrer tant qu'une
 * recherche est en cours ? Le champ, lui, se débrouille avec son Ctrl+F.
 */
export function useLineSearch(): { query: Ref<string>; searching: ComputedRef<boolean> } {
  const query = ref('')
  return { query, searching: computed(() => query.value.trim() !== '') }
}
