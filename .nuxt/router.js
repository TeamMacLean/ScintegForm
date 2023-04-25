import Vue from 'vue'
import Router from 'vue-router'
import { normalizeURL, decode } from 'ufo'
import { interopDefault } from './utils'
import scrollBehavior from './router.scrollBehavior.js'

const _467d18c9 = () => interopDefault(import('../pages/help.vue' /* webpackChunkName: "pages/help" */))
const _1df06d42 = () => interopDefault(import('../pages/index_OLD.vue' /* webpackChunkName: "pages/index_OLD" */))
const _88a39958 = () => interopDefault(import('../pages/submission.vue' /* webpackChunkName: "pages/submission" */))
const _5d5fa3ab = () => interopDefault(import('../pages/success.vue' /* webpackChunkName: "pages/success" */))
const _0e4ff0fa = () => interopDefault(import('../pages/index.vue' /* webpackChunkName: "pages/index" */))

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
    component: _467d18c9,
    name: "help"
  }, {
    path: "/index_OLD",
    component: _1df06d42,
    name: "index_OLD"
  }, {
    path: "/submission",
    component: _88a39958,
    name: "submission"
  }, {
    path: "/success",
    component: _5d5fa3ab,
    name: "success"
  }, {
    path: "/",
    component: _0e4ff0fa,
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
