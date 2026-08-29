import { createRouter, createWebHashHistory, type RouteRecordRaw } from 'vue-router'

/**
 * Historique par hash : en production la page est chargée en `file://`, où
 * l'historique HTML5 ne fonctionne pas.
 */
const routes: RouteRecordRaw[] = [
  { path: '/', redirect: { name: 'tools' } },
  {
    path: '/tools',
    name: 'tools',
    component: () => import('@/views/ToolsPane.vue')
  },
  {
    path: '/tools/:toolId',
    name: 'projects',
    component: () => import('@/views/ProjectsPane.vue'),
    props: true
  },
  {
    path: '/tools/:toolId/p/:projectId',
    name: 'sequences',
    component: () => import('@/views/SequencesPane.vue'),
    props: true
  },
  {
    path: '/tools/:toolId/p/:projectId/s/:sequenceId',
    name: 'final',
    component: () => import('@/views/FinalInputView.vue'),
    props: true
  },
  { path: '/:pathMatch(.*)*', redirect: { name: 'tools' } }
]

export const router = createRouter({
  history: createWebHashHistory(),
  routes
})
