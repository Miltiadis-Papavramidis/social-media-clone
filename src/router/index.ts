import { createRouter, createWebHistory } from 'vue-router'
import { supabase } from '@/lib/supabase'

import RegisterView from '@/views/RegisterView.vue'
import LoginView from '@/views/LoginView.vue'
import FeedView from '@/views/FeedView.vue'
import ProfileView from '@/views/ProfileView.vue'
import MessagesView from '@/views/MessagesView.vue'
import UserProfileView from '@/views/UserProfileView.vue'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/',
      redirect: '/login',
    },
    {
      path: '/login',
      component: LoginView,
      meta: {
        requiresGuest: true,
      },
    },
    {
      path: '/register',
      component: RegisterView,
      meta: {
        requiresGuest: true,
      },
    },
    {
      path: '/feed',
      component: FeedView,
      meta: {
        requiresAuth: true,
      },
    },
    {
      path: '/profile',
      component: ProfileView,
      meta: {
        requiresAuth: true,
      },
    },
{
  path: '/messages',
  component: MessagesView,
  meta: {
    requiresAuth: true,
  },
},
{
  path: '/profile/:id',
  component: UserProfileView,
  meta: {
    requiresAuth: true,
  },
},
  ],
})

 router.beforeEach(async (to) => {
  const {
    data: { session },
  } = await supabase.auth.getSession()

  // Αν χρειάζεται login αλλά δεν υπάρχει session
  if (to.meta.requiresAuth && !session) {
    return '/login'
  }

  // Αν είναι ήδη login και πάει Login/Register
  if (to.meta.requiresGuest && session) {
    return '/feed'
  }
})

export default router
