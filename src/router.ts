import { createRouter, createWebHashHistory } from 'vue-router'

const router = createRouter({
    history: createWebHashHistory(),
    routes: [
        {
            path: '/',
            name: 'dashboard',
            component: () => import('@/popup/pages/Dashboard.vue')
        },
        {
            path: '/search',
            name: 'search',
            component: () => import('@/popup/pages/SearchManager.vue')
        },
        {
            path: '/fanpages',
            name: 'fanpages',
            component: () => import('@/popup/pages/FanpageManager.vue')
        },
        {
            path: '/keywords',
            name: 'keywords',
            component: () => import('@/popup/pages/KeywordManager.vue')
        },
        {
            path: '/schedule',
            name: 'schedule',
            component: () => import('@/popup/pages/ScheduleManager.vue')
        },
        {
            path: '/guide',
            name: 'guide',
            component: () => import('@/popup/pages/GuideManager.vue')
        }
    ]
})

export default router
