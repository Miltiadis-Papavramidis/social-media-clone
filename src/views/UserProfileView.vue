<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import { supabase } from '@/lib/supabase'

const route = useRoute()
const userId = route.params.id as string
const username = ref('')
const bio = ref('')
const avatarUrl = ref('')
const followers = ref(0)
const following = ref(0)
const currentUserId = ref('')
const followState = ref<'follow' | 'following' | 'unfollowed'>('follow')
const postsCount = ref(0)

const loadProfile = async () => {
  const { data, error } = await supabase.from('profiles').select('*').eq('id', userId).single()

  if (error) {
    console.error(error)
    return
  }

  username.value = data.username
  bio.value = data.bio || ''
  avatarUrl.value = data.avatar_url || ''
}

const loadFollowers = async () => {
  const { count } = await supabase
    .from('follows')
    .select('*', { count: 'exact', head: true })
    .eq('following_id', userId)

  followers.value = count || 0
}

const loadFollowing = async () => {
  const { count } = await supabase
    .from('follows')
    .select('*', { count: 'exact', head: true })
    .eq('follower_id', userId)

  following.value = count || 0
}

const checkFollowing = async () => {
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return

  currentUserId.value = user.id

  const { data } = await supabase
    .from('follows')
    .select('*')
    .eq('follower_id', user.id)
    .eq('following_id', userId)

  followState.value = data.length > 0 ? 'following' : 'follow'
}

const toggleFollow = async () => {
  if (followState.value === 'follow') {
    const { error } = await supabase.from('follows').insert({
      follower_id: currentUserId.value,
      following_id: userId,
    })

    if (error) {
      console.error(error)
      return
    }

    followState.value = 'following'
  } else if (followState.value === 'following') {
    const { error } = await supabase
      .from('follows')
      .delete()
      .eq('follower_id', currentUserId.value)
      .eq('following_id', userId)

    if (error) {
      console.error(error)
      return
    }

    followState.value = 'unfollowed'

    setTimeout(() => {
      followState.value = 'follow'
    }, 1200)
  }

  await loadFollowers()
  await loadFollowing()
}

type Post = {
  id: string
  content: string
  image_url: string | null
  created_at: string
}

const posts = ref<Post[]>([])

const loadPosts = async () => {
  const { data, error } = await supabase
    .from('posts')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })

  if (error) {
    console.error(error)
    return
  }

  posts.value = data || []
  postsCount.value = posts.value.length
}

onMounted(async () => {
  await loadProfile()
  await loadFollowers()
  await loadFollowing()
  await checkFollowing()
  await loadPosts()
})
</script>
<template>
  <div class="profile-container">
    <div class="profile-header">
      <div class="avatar">
        <img v-if="avatarUrl" :src="avatarUrl" alt="Avatar" />

        <span v-else>👤</span>
      </div>

      <div class="profile-info">
        <h1>{{ username }}</h1>

        <p class="bio">
          {{ bio || 'No bio yet.' }}
        </p>

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

        <button v-if="currentUserId !== userId" @click="toggleFollow">
          {{
            followState === 'follow'
              ? 'Follow'
              : followState === 'following'
                ? 'Following ✓'
                : 'Unfollowed'
          }}
        </button>
      </div>
    </div>

    <hr />

    <h2>Posts</h2>

    <div class="posts-grid">
      <div v-for="post in posts" :key="post.id" class="post-card">
        <img v-if="post.image_url" :src="post.image_url" />

        <div v-else class="text-post">
          {{ post.content }}
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

.profile-header {
  display: flex;
  gap: 40px;
  align-items: center;
  margin-bottom: 40px;
}

.avatar {
  width: 140px;
  height: 140px;
  border-radius: 50%;
  background: #ececec;

  display: flex;
  justify-content: center;
  align-items: center;

  font-size: 60px;
}

.profile-info {
  flex: 1;
}

.profile-info h1 {
  margin-bottom: 10px;
}

.bio {
  color: #666;
  margin-bottom: 20px;
}

.stats {
  display: flex;
  gap: 40px;
  margin-bottom: 25px;
}

.stats div {
  display: flex;
  flex-direction: column;
  align-items: center;
}

.stats strong {
  font-size: 22px;
}

button {
  padding: 10px 24px;
  border: none;
  border-radius: 8px;
  background: #2563eb;
  color: white;
  cursor: pointer;
}

button:hover {
  background: #1d4ed8;
}

.posts-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 15px;
  margin-top: 30px;
}

.post-card {
  aspect-ratio: 1;
  overflow: hidden;
  border-radius: 12px;
  background: #f4f4f4;
}

.post-card img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.text-post {
  padding: 15px;
  height: 100%;

  display: flex;
  justify-content: center;
  align-items: center;

  text-align: center;
}

.avatar {
  width: 140px;
  height: 140px;

  border-radius: 50%;
  overflow: hidden;

  background: #ececec;

  display: flex;
  justify-content: center;
  align-items: center;

  flex-shrink: 0;
}

.avatar img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.avatar span {
  font-size: 60px;
}
</style>
