<script setup lang="ts">
import { supabase } from '@/lib/supabase'
import { useRouter } from 'vue-router'
import { ref } from 'vue'

type Profile = {
  id: string
  username: string
  avatar_url: string | null
}

const search = ref('')
const results = ref<Profile[]>([])

const router = useRouter()

const logout = async () => {
  await supabase.auth.signOut()
  router.push('/login')
}

const searchUsers = async () => {
  if (!search.value.trim()) {
    results.value = []
    return
  }

  const { data, error } = await supabase
    .from('profiles')
    .select('id, username, avatar_url')
    .ilike('username', `%${search.value}%`)
    .limit(5)

  if (error) {
    console.error(error)
    return
  }

  results.value = data || []
}

const openProfile = (id: string) => {
  router.push(`/profile/${id}`)

  search.value = ''
  results.value = []
}
</script>

<template>
  <nav class="navbar">
    <h2 class="logo">Mini Social</h2>

    <div class="search-box">
      <input v-model="search" @input="searchUsers" placeholder="Search users..." />

      <div v-if="results.length" class="search-results">
        <div
          v-for="user in results"
          :key="user.id"
          class="search-user"
          @click="openProfile(user.id)"
        >
          <div class="avatar-small">
            <img v-if="user.avatar_url" :src="user.avatar_url" alt="Avatar" />

            <span v-else>👤</span>
          </div>

          <span>{{ user.username }}</span>
        </div>
      </div>
    </div>

    <div class="links">
      <RouterLink to="/feed">🏠 Feed</RouterLink>

      <RouterLink to="/profile">👤 Profile</RouterLink>

      <RouterLink to="/messages">📩DM</RouterLink>

      <button @click="logout">🚪 Logout</button>
    </div>
  </nav>
</template>

<style scoped>
.navbar {
  height: 70px;

  background: white;

  display: flex;
  justify-content: space-between;
  align-items: center;

  padding: 0 40px;

  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.08);

  position: sticky;
  top: 0;
  z-index: 100;
}

.logo {
  color: royalblue;
  font-size: 26px;
  font-weight: bold;
}

.links {
  display: flex;
  align-items: center;
  gap: 25px;
}

a {
  text-decoration: none;
  color: #555;
  font-weight: 600;
  transition: 0.2s;
}

a:hover {
  color: royalblue;
}

a.router-link-active {
  color: royalblue;
}

button {
  border: none;
  background: crimson;

  color: white;

  padding: 10px 18px;

  border-radius: 8px;

  cursor: pointer;

  font-weight: bold;

  transition: 0.2s;
}

button:hover {
  background: #b00032;
}

.search-box {
  position: relative;
}

.search-box input {
  width: 250px;
  padding: 8px 12px;
  border-radius: 8px;
  border: 1px solid #ddd;
}

.search-results {
  position: absolute;
  top: 42px;
  left: 0;

  width: 250px;

  background: white;

  border: 1px solid #ddd;
  border-radius: 10px;

  box-shadow: 0 5px 20px rgba(0, 0, 0, 0.1);

  z-index: 100;
}

.search-user {
  padding: 10px;
  cursor: pointer;
}

.search-user:hover {
  background: #f4f4f4;
}
.search-user {
  display: flex;
  align-items: center;
  gap: 12px;

  padding: 10px;
  cursor: pointer;
}

.search-user:hover {
  background: #f5f5f5;
}

.avatar-small {
  width: 42px;
  height: 42px;

  border-radius: 50%;
  overflow: hidden;

  background: #ececec;

  display: flex;
  justify-content: center;
  align-items: center;

  flex-shrink: 0;
}

.avatar-small img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.avatar-small span {
  font-size: 20px;
}
</style>
