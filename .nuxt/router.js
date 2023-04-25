import Vue from 'vue'
import Router from 'vue-router'
import { normalizeURL, decode } from 'ufo'
import { interopDefault } from './utils'
import scrollBehavior from './router.scrollBehavior.js'

const _00a2a9e7 = () => interopDefault(import('../pages/help.vue' /* webpackChunkName: "pages/help" */))
const _d6624238 = () => interopDefault(import('../pages/index_OLD.vue' /* webpackChunkName: "pages/index_OLD" */))
const _209df5f2 = () => interopDefault(import('../pages/submission.vue' /* webpackChunkName: "pages/submission" */))
const _771215cd = () => interopDefault(import('../pages/success.vue' /* webpackChunkName: "pages/success" */))
const _ce46f8c8 = () => interopDefault(import('../pages/index.vue' /* webpackChunkName: "pages/index" */))

const emptyFn = () => {}

Vue.use(Router)

export const routerOptions = {
  mode: 'history',
  base: '/',
  linkActiveClass: 'is-active',
  linkExactActiveClass: 'nuxt-link-exact-active',
  scrollBehavior,

  routes: [{
    path: "/help",
    component: _00a2a9e7,
    name: "help"
  }, {
    path: "/index_OLD",
    component: _d6624238,
    name: "index_OLD"
  }, {
    path: "/submission",
    component: _209df5f2,
    name: "submission"
  }, {
    path: "/success",
    component: _771215cd,
    name: "success"
  }, {
    path: "/",
    component: _ce46f8c8,
    name: "index"
  }],

  fallback: false
}

export function createRouter (ssrContext, config) {
  const base = (config._app && config._app.basePath) || routerOptions.base
  const router = new Router({ ...routerOptions, base  })

  // TODO: remove in Nuxt 3
  const originalPush = router.push
  router.push = function push (location, onComplete = emptyFn, onAbort) {
    return originalPush.call(this, location, onComplete, onAbort)
  }

  const resolve = router.resolve.bind(router)
  router.resolve = (to, current, append) => {
    if (typeof to === 'string') {
      to = normalizeURL(to)
    }
    return resolve(to, current, append)
  }

  return router
}
