import { createRouter, createWebHistory } from 'vue-router'
import { ElMessage } from 'element-plus'
import store from '../store'
import axios from '@/utils/axios'
import i18n from '@/locales'

// 通用的管理员认证守卫
const adminAuthGuard = async (to, from, next) => {
  const wasLoggedIn = store.state.adminLoggedIn
  const loggedIn = await store.dispatch('checkAdminSession')
  if (loggedIn) {
    return next()
  }

  if (to.name !== 'adminLogin') {
    if (wasLoggedIn) {
      ElMessage.error(i18n.global.t('login.authRequired'))
    }
    return next({ name: 'adminLogin', query: { redirect: to.fullPath } })
  }
  next()
}

// 通用的用户认证守卫
const userAuthGuard = (to, from, next) => {
  axios.get('/api/auth/sessionCheck', {
    withCredentials: true
  }).then(res => {
    const data = res.data || {}

    // 不需要用户端认证，直接放行
    if (!data.userRequired) {
      store.commit('setUserLoggedIn', true)
      return next()
    }

    // 需要认证，检查是否有有效 session（user 或 admin 都可以）
    if (data.valid) {
      store.commit('setUserLoggedIn', true)
      return next()
    }

    // 需要认证但没有有效 session，跳转登录
    // 只有之前已登录（session 过期）才提示错误，首次未登录静默跳转
    const wasLoggedIn = store.state.userLoggedIn
    store.commit('setUserLoggedIn', false)
    if (to.name !== 'login') {
      if (wasLoggedIn) {
        ElMessage.error(i18n.global.t('login.authRequired'))
      }
      next({ name: 'login' })
    } else {
      next()
    }
  }).catch(() => {
    const wasLoggedIn = store.state.userLoggedIn
    store.commit('setUserLoggedIn', false)
    if (to.name !== 'login') {
      if (wasLoggedIn) {
        ElMessage.error(i18n.global.t('login.authRequired'))
      }
      next({ name: 'login' })
    } else {
      next()
    }
  })
}

const routes = [
  {
    path: '/',
    name: 'home',
    component: () => import('../views/UploadHome.vue')
  },
  {
    path: '/login',
    name: 'login',
    redirect: '/'
  },
  {
    path: '/dashboard',
    name: 'dashboard',
    component: () => import('../views/AdminDashBoard.vue'),
    beforeEnter: adminAuthGuard
  },
  {
    path: '/customerConfig',
    name: 'customerConfig',
    component: () => import('../views/CustomerConfig.vue'),
    beforeEnter: adminAuthGuard
  },
  {
    path: '/systemConfig',
    name: 'systemConfig',
    component: () => import('../views/SystemConfig.vue'),
    beforeEnter: adminAuthGuard
  },
  {
    path: '/adminLogin',
    name: 'adminLogin',
    component: () => import('../views/AdminLogin.vue'),
  },
  {
    path: '/blockimg',
    name: 'blockimg',
    component: () => import('../views/BlockImage.vue'),
  },
  {
    path: '/whiteliston',
    name: 'whiteliston',
    component: () => import('../views/WhiteListOn.vue'),
  },
  {
    path: '/browse/:dir*',
    name: 'publicBrowse',
    component: () => import('../views/PublicBrowse.vue'),
  },
  {
    path: '/:pathMatch(.*)*',
    name: 'notFound',
    component: () => import('../views/NotFound.vue'),
  },
]

const router = createRouter({
  history: createWebHistory(process.env.BASE_URL),
  routes
})

export default router
