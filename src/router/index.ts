import { createRouter, createWebHistory, type RouteRecordRaw } from 'vue-router'
import { useAuthStore } from '@/stores/auth'

const routes: RouteRecordRaw[] = [
  {
    path: '/',
    name: 'home',
    component: () => import('@/pages/HomePage.vue'),
  },
  {
    path: '/login',
    name: 'login',
    component: () => import('@/pages/LoginPage.vue'),
    meta: { guest: true },
  },
  {
    path: '/signup',
    name: 'signup',
    component: () => import('@/pages/SignupPage.vue'),
    meta: { guest: true },
  },
  {
    path: '/contents/:slug',
    name: 'content-detail',
    component: () => import('@/pages/ContentDetailPage.vue'),
    meta: { fullBleed: true },
  },
  {
    path: '/watchlists',
    name: 'watchlists',
    component: () => import('@/pages/WatchlistsPage.vue'),
    meta: { requiresAuth: true, fullBleed: true },
  },
  {
    path: '/watchlists/:id',
    name: 'watchlist-detail',
    component: () => import('@/pages/WatchlistDetailPage.vue'),
    meta: { requiresAuth: true, fullBleed: true },
  },
  {
    path: '/ritmo',
    name: 'pace',
    component: () => import('@/pages/PacePage.vue'),
    meta: { requiresAuth: true, fullBleed: true },
  },
  {
    path: '/admin/contents',
    name: 'admin-contents',
    component: () => import('@/pages/AdminContentsPage.vue'),
    meta: { requiresAuth: true, requiresAdmin: true },
  },
  {
    path: '/admin/contents/new',
    name: 'admin-content-new',
    component: () => import('@/pages/AdminContentFormPage.vue'),
    meta: { requiresAuth: true, requiresAdmin: true },
  },
  {
    path: '/admin/contents/:slug/edit',
    name: 'admin-content-edit',
    component: () => import('@/pages/AdminContentFormPage.vue'),
    meta: { requiresAuth: true, requiresAdmin: true },
  },
]

const router = createRouter({
  history: createWebHistory(),
  routes,
  scrollBehavior() {
    return { top: 0 }
  },
})

router.beforeEach((to) => {
  const auth = useAuthStore()
  if (to.meta.guest && auth.isAuthenticated) return { path: '/' }
  if (to.meta.requiresAuth && !auth.isAuthenticated) {
    return { path: '/login', query: { redirect: to.fullPath } }
  }
  if (to.meta.requiresAdmin && !auth.isAdmin) return { path: '/' }
})

export default router
