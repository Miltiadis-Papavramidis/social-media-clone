<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { supabase } from '@/lib/supabase'

type Post = {
  id: string
  user_id: string
  content: string
  created_at: string
}

type SavedPost = {
  id: string
  content: string
  image_url: string | null
  created_at: string

  profiles: {
    username: string
  }
}

const email = ref('')
const userId = ref('')
const username = ref('')
const bio = ref('')
const posts = ref<Post[]>([])
const editing = ref(false)
const savedPosts = ref<SavedPost[]>([])
const activeTab = ref<'posts' | 'saved'>('posts')
const avatar = ref<File | null>(null)
const avatarUrl = ref('')
const followers = ref(0)
const following = ref(0)
const postsCount = ref(0)

const loadProfile = async () => {
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return

  email.value = user.email || ''
  userId.value = user.id

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single()

  if (profileError) {
    console.error(profileError)
    return
  }

  username.value = profile.username
  bio.value = profile.bio || ''
  avatarUrl.value = profile.avatar_url || ''

  const { data, error } = await supabase
    .from('posts')
    .select('*')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })

  if (error) {
    console.error(error)
    return
  }

  posts.value = data || []
  postsCount.value = posts.value.length
}

const saveProfile = async () => {
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return

  const { error } = await supabase
    .from('profiles')
    .update({
      username: username.value,
      bio: bio.value,
    })
    .eq('id', user.id)

  if (error) {
    alert(error.message)
    return
  }

  alert('Το προφίλ ενημερώθηκε!')

  editing.value = false

  alert('Το προφίλ ενημερώθηκε!')
}

const uploadAvatar = async (event: Event) => {
  const target = event.target as HTMLInputElement

  if (!target.files?.length) return

  avatar.value = target.files[0]

  const fileName = `${userId.value}-${Date.now()}`

  const { error } = await supabase.storage.from('avatars').upload(fileName, avatar.value)

  if (error) {
    alert(error.message)
    return
  }

  const { data } = supabase.storage.from('avatars').getPublicUrl(fileName)

  avatarUrl.value = data.publicUrl

  await supabase
    .from('profiles')
    .update({
      avatar_url: avatarUrl.value,
    })
    .eq('id', userId.value)
}

const loadSavedPosts = async () => {
  const { data, error } = await supabase
    .from('saved_posts')
    .select(
      `
      posts (
        id,
        content,
        image_url,
        created_at,
        user_id,
        profiles(username)
      )
    `,
    )
    .eq('user_id', userId.value)

  if (error) {
    console.error(error)
    return
  }

  savedPosts.value = (data || []).map((item: any) => item.posts)
}

const loadFollowers = async () => {
  const { count } = await supabase
    .from('follows')
    .select('*', {
      count: 'exact',
      head: true,
    })
    .eq('following_id', userId.value)

  followers.value = count || 0
}

const loadFollowing = async () => {
  const { count } = await supabase
    .from('follows')
    .select('*', {
      count: 'exact',
      head: true,
    })
    .eq('follower_id', userId.value)

  following.value = count || 0
}

onMounted(async () => {
  await loadProfile()
  await loadFollowers()
  await loadFollowing()
  await loadSavedPosts()
})
</script>

<template>
  <div class="profile-container">
    <div class="profile-card">
      <label class="avatar">
        <img v-if="avatarUrl" :src="avatarUrl" alt="Avatar" />

        <span v-else>👤</span>

        <input type="file" accept="image/*" hidden @change="uploadAvatar" />
      </label>

      <h2>{{ username || 'Username' }}</h2>

      <p class="email">{{ email }}</p>

      <p class="bio">
        {{ bio || 'Δεν υπάρχει bio ακόμα.' }}
      </p>

      <div v-if="!editing">
        <button @click="editing = true">Edit Profile</button>
      </div>

      <div v-else>
        <input v-model="username" placeholder="Username" />

        <textarea v-model="bio" placeholder="Bio"></textarea>

        <div class="buttons">
          <button @click="saveProfile">Save</button>

          <button class="cancel" @click="editing = false">Cancel</button>
        </div>
      </div>

      <div class="stats">
        <div>
          <strong>{{ postsCount }}</strong>
          <span>Posts</span>
        </div>

        <div>
          <strong>{{ followers }}</strong>
          <span>Followers</span>
        </div>

        <div>
          <strong>{{ following }}</strong>
          <span>Following</span>
        </div>
      </div>
    </div>

    <div class="posts-card">
      <div class="tabs">
        <button :class="{ active: activeTab === 'posts' }" @click="activeTab = 'posts'">
          Posts
        </button>

        <button :class="{ active: activeTab === 'saved' }" @click="activeTab = 'saved'">
          Saved
        </button>
      </div>

      <!-- POSTS -->
      <div v-if="activeTab === 'posts'" class="posts-grid">
        <div v-for="post in posts" :key="post.id" class="saved-post">
          <img v-if="post.image_url" :src="post.image_url" />

          <p>{{ post.content }}</p>
        </div>
      </div>

      <!-- SAVED -->
      <div v-if="activeTab === 'saved'" class="posts-grid">
        <div v-for="post in savedPosts" :key="post.id" class="saved-post">
          <img v-if="post.image_url" :src="post.image_url" />

          <p>{{ post.content }}</p>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.profile-container {
  max-width: 900px;
  margin: 40px auto;
  padding: 20px;
}

.profile-card {
  background: white;
  border-radius: 16px;
  padding: 30px;
  box-shadow: 0 5px 15px rgba(0, 0, 0, 0.08);
  text-align: center;
}

.avatar {
  width: 100px;
  height: 100px;

  margin: auto;

  border-radius: 50%;

  background: #ececec;

  display: flex;
  justify-content: center;
  align-items: center;

  font-size: 48px;

  margin-bottom: 20px;
}

.email {
  color: gray;
  margin-top: 8px;
}

.bio {
  margin: 20px 0;
  font-size: 16px;
}

input,
textarea {
  width: 100%;
  padding: 12px;

  margin-top: 15px;

  border: 1px solid #ddd;
  border-radius: 10px;

  font-size: 15px;
}

textarea {
  min-height: 120px;
  resize: none;
}

.buttons {
  display: flex;
  justify-content: center;
  gap: 15px;

  margin-top: 20px;
}

button {
  padding: 12px 24px;

  border: none;
  border-radius: 8px;

  background: royalblue;
  color: white;

  font-weight: bold;

  cursor: pointer;

  transition: 0.2s;
}

button:hover {
  background: #295edb;
}

.cancel {
  background: crimson;
}

.cancel:hover {
  background: #b00032;
}

.posts-card {
  margin-top: 30px;

  background: white;

  border-radius: 16px;

  padding: 25px;

  box-shadow: 0 5px 15px rgba(0, 0, 0, 0.08);
}

.my-post {
  padding: 15px;
  border-bottom: 1px solid #eee;
}

.my-post:last-child {
  border-bottom: none;
}

.posts-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 15px;
  margin-top: 20px;
}

.saved-post img {
  width: 100%;
  aspect-ratio: 1;
  object-fit: cover;
  border-radius: 10px;
}

.saved-post p {
  margin-top: 8px;
}

.tabs {
  display: flex;
  justify-content: center;
  gap: 30px;
  margin-bottom: 25px;
  border-bottom: 1px solid #eee;
}

.tabs button {
  background: transparent;
  color: #666;
  border: none;
  padding: 14px 8px;
  font-size: 16px;
  font-weight: 600;
  cursor: pointer;
  border-bottom: 3px solid transparent;
}

.tabs button.active {
  color: royalblue;
  border-bottom-color: royalblue;
}

.avatar {
  width: 120px;
  height: 120px;
  margin: auto;

  border-radius: 50%;
  overflow: hidden;

  background: #ececec;

  display: flex;
  justify-content: center;
  align-items: center;

  cursor: pointer;
}

.avatar img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.avatar span {
  font-size: 55px;
}

.stats {
  display: flex;
  justify-content: center;
  gap: 45px;

  margin: 25px 0;
}

.stats div {
  display: flex;
  flex-direction: column;
  align-items: center;
}

.stats strong {
  font-size: 22px;
}

.stats span {
  color: gray;
  font-size: 14px;
}
</style>
