<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import { supabase } from '@/lib/supabase'

type HighlightStory = {
  id: string
  story_id: string
  order_index: number

  story: {
    id: string
    media_url: string
    media_type: string
  }
}

type Highlight = {
  id: string
  user_id: string
  title: string
  cover_story_id: string | null
  created_at: string

  cover_story: {
    id: string
    media_url: string
    media_type: string
  } | null

  highlight_stories: HighlightStory[]
}

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
const highlights = ref<Highlight[]>([])
const showCreateHighlight = ref(false)
const highlightTitle = ref('')
const selectedStories = ref<string[]>([])
const userStories = ref<any[]>([])

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

const loadHighlights = async () => {
  const { data, error } = await supabase
    .from('story_highlights')
    .select(
      `
      id,
      user_id,
      title,
      cover_story_id,
      created_at,

      cover_story:cover_story_id(
        id,
        media_url,
        media_type
      ),

      highlight_stories(
        id,
        story_id,
        order_index,

        story:story_id(
          id,
          media_url,
          media_type
        )
      )
    `,
    )
    .eq('user_id', userId)
    .order('created_at', { ascending: true })

  if (error) {
    console.error(error)
    return
  }

  highlights.value = (data || []).map((highlight: any) => {
    highlight.highlight_stories?.sort((a: any, b: any) => a.order_index - b.order_index)

    return highlight
  })
}

const loadUserStories = async () => {
  const { data, error } = await supabase
    .from('stories')
    .select(
      `
      id,
      media_url,
      media_type,
      created_at
    `,
    )
    .eq('user_id', userId)
    .order('created_at', { ascending: false })

  if (error) {
    console.error(error)
    return
  }

  userStories.value = data || []
}

const createHighlight = async () => {
  if (!highlightTitle.value.trim()) {
    alert('Βάλε τίτλο στο highlight')
    return
  }

  if (selectedStories.value.length === 0) {
    alert('Επίλεξε τουλάχιστον ένα story')
    return
  }

  if (currentUserId.value !== userId) {
    return
  }

  const coverStoryId = selectedStories.value[0]

  const { data: highlight, error } = await supabase
    .from('story_highlights')
    .insert({
      user_id: currentUserId.value,
      title: highlightTitle.value.trim(),
      cover_story_id: coverStoryId,
    })
    .select()
    .single()

  if (error) {
    console.error(error)
    alert(error.message)
    return
  }

  const highlightStories = selectedStories.value.map((storyId, index) => ({
    highlight_id: highlight.id,
    story_id: storyId,
    order_index: index,
  }))

  const { error: storiesError } = await supabase.from('highlight_stories').insert(highlightStories)

  if (storiesError) {
    console.error(storiesError)
    alert(storiesError.message)
    return
  }

  highlightTitle.value = ''
  selectedStories.value = []
  showCreateHighlight.value = false

  await loadHighlights()
}

const openCreateHighlight = async () => {
  await loadUserStories()
  showCreateHighlight.value = true
}

const closeCreateHighlight = () => {
  showCreateHighlight.value = false
  highlightTitle.value = ''
  selectedStories.value = []
}

onMounted(async () => {
  await loadProfile()
  await loadFollowers()
  await loadFollowing()
  await checkFollowing()
  await loadPosts()

  await loadHighlights()

  if (currentUserId.value === userId) {
    await loadUserStories()
  }
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

    <!-- HIGHLIGHTS -->
    <div class="highlights-section">
      <div class="highlights-header">
        <h2>Highlights</h2>

        <button
          v-if="currentUserId === userId"
          class="add-highlight-btn"
          @click="openCreateHighlight"
        >
          + New
        </button>
      </div>

      <div class="highlights-list">
        <!-- New Highlight -->
        <button
          v-if="currentUserId === userId"
          class="highlight-item new-highlight"
          @click="openCreateHighlight"
        >
          <div class="highlight-circle add-circle">+</div>

          <span>New</span>
        </button>

        <!-- Existing Highlights -->
        <button v-for="highlight in highlights" :key="highlight.id" class="highlight-item">
          <div class="highlight-circle">
            <img v-if="highlight.cover_story" :src="highlight.cover_story.media_url" />

            <span v-else>📷</span>
          </div>

          <span>
            {{ highlight.title }}
          </span>
        </button>
      </div>
    </div>

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

  <div
    v-if="showCreateHighlight"
    class="highlight-modal-overlay"
    @click.self="closeCreateHighlight"
  >
    <div class="highlight-modal">
      <div class="modal-header">
        <h2>New Highlight</h2>

        <button @click="closeCreateHighlight">✕</button>
      </div>

      <input v-model="highlightTitle" type="text" placeholder="Highlight name" maxlength="30" />

      <h3>Select stories</h3>

      <div class="story-selection">
        <button
          v-for="story in userStories"
          :key="story.id"
          class="story-select"
          :class="{
            selected: selectedStories.includes(story.id),
          }"
          @click="
            selectedStories.includes(story.id)
              ? (selectedStories = selectedStories.filter((id) => id !== story.id))
              : selectedStories.push(story.id)
          "
        >
          <img :src="story.media_url" :alt="story.id" />

          <div v-if="selectedStories.includes(story.id)" class="selected-check">✓</div>
        </button>
      </div>

      <button class="create-highlight-btn" @click="createHighlight">Create Highlight</button>
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

.highlights-section {
  margin: 30px 0;
}

.highlights-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.highlights-header h2 {
  margin: 0;
}

.add-highlight-btn {
  width: auto;
  margin: 0;
  padding: 8px 16px;
}

.highlights-list {
  display: flex;
  gap: 22px;
  overflow-x: auto;
  padding: 20px 5px;
}

.highlight-item {
  border: none;
  background: transparent;
  cursor: pointer;

  display: flex;
  flex-direction: column;
  align-items: center;

  gap: 8px;

  min-width: 80px;
  color: #222;
}

.highlight-circle {
  width: 75px;
  height: 75px;

  border-radius: 50%;
  padding: 3px;

  background: linear-gradient(
    45deg,
    #feda75,
    #fa7e1e,
    #d62976,
    #962fbf,
    #4f5bd5
  );

  display: flex;
  align-items: center;
  justify-content: center;
}

.highlight-circle img {
  width: 100%;
  height: 100%;

  border-radius: 50%;
  object-fit: cover;

  border: 3px solid white;
}

.add-circle {
  background: #f3f4f6;
  border: 1px solid #ddd;

  font-size: 30px;
  color: #555;
}

.highlight-item span {
  font-size: 13px;
  max-width: 80px;

  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* Modal */

.highlight-modal-overlay {
  position: fixed;
  inset: 0;

  background: rgba(0, 0, 0, 0.55);

  display: flex;
  justify-content: center;
  align-items: center;

  z-index: 9999;
}

.highlight-modal {
  width: 450px;
  max-width: 90vw;

  max-height: 80vh;

  background: white;
  border-radius: 18px;

  padding: 25px;

  overflow-y: auto;
}

.modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;

  margin-bottom: 20px;
}

.modal-header h2 {
  margin: 0;
}

.modal-header button {
  width: auto;
  margin: 0;

  background: transparent;
  color: #333;

  font-size: 18px;
}

.highlight-modal input {
  width: 100%;

  padding: 12px;

  border: 1px solid #ddd;
  border-radius: 10px;

  box-sizing: border-box;
}

.highlight-modal h3 {
  margin-top: 25px;
}

.story-selection {
  display: grid;

  grid-template-columns: repeat(4, 1fr);

  gap: 12px;
}

.story-select {
  position: relative;

  width: 100%;
  aspect-ratio: 9 / 16;

  padding: 0;

  margin: 0;

  border: 3px solid transparent;
  border-radius: 10px;

  overflow: hidden;

  background: #eee;
}

.story-select img {
  width: 100%;
  height: 100%;

  object-fit: cover;
}

.story-select.selected {
  border-color: #2563eb;
}

.selected-check {
  position: absolute;

  top: 6px;
  right: 6px;

  width: 24px;
  height: 24px;

  border-radius: 50%;

  background: #2563eb;
  color: white;

  display: flex;
  align-items: center;
  justify-content: center;

  font-size: 14px;
}

.create-highlight-btn {
  margin-top: 25px;
}
</style>
