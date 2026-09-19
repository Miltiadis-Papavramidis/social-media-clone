<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { supabase } from '@/lib/supabase'

type Post = {
  id: string
  user_id: string
  content: string
  image_url: string | null
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

type Highlight = {
  id: string
  user_id: string
  title: string
  cover_story_id: string | null
  created_at: string

  highlight_stories: {
    id: string
    story_id: string
    order_index: number
  }[]
}

type Story = {
  id: string
  user_id: string
  media_url: string | null
  media_type: string
  created_at: string
  expires_at: string
}

const stories = ref<Story[]>([])
const email = ref('')
const userId = ref('')
const username = ref('')
const bio = ref('')
const posts = ref<Post[]>([])
const savedPosts = ref<SavedPost[]>([])
const editing = ref(false)
const activeTab = ref<'posts' | 'saved'>('posts')
const avatar = ref<File | null>(null)
const avatarUrl = ref('')
const followers = ref(0)
const following = ref(0)
const postsCount = ref(0)
const highlights = ref<Highlight[]>([])
const showCreateHighlight = ref(false)
const newHighlightTitle = ref('')
const selectedStories = ref<string[]>([])
const showMyStory = ref(false)
const myStory = ref<Story | null>(null)

// =========================
// LOAD PROFILE
// =========================

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

  await loadPosts()
}

// =========================
// LOAD POSTS
// =========================

const loadPosts = async () => {
  if (!userId.value) return

  const { data, error } = await supabase
    .from('posts')
    .select('*')
    .eq('user_id', userId.value)
    .order('created_at', { ascending: false })

  if (error) {
    console.error(error)
    return
  }

  posts.value = data || []
  postsCount.value = posts.value.length
}

// =========================
// SAVE PROFILE
// =========================

const saveProfile = async () => {
  if (!userId.value) return

  const { error } = await supabase
    .from('profiles')
    .update({
      username: username.value,
      bio: bio.value,
    })
    .eq('id', userId.value)

  if (error) {
    alert(error.message)
    return
  }

  editing.value = false
}

// =========================
// UPLOAD AVATAR
// =========================

const uploadAvatar = async (event: Event) => {
  const target = event.target as HTMLInputElement

  if (!target.files?.length) return
  if (!userId.value) return

  avatar.value = target.files[0]

  const fileName = `${userId.value}-${Date.now()}`

  const { error } = await supabase.storage.from('avatars').upload(fileName, avatar.value)

  if (error) {
    alert(error.message)
    return
  }

  const { data } = supabase.storage.from('avatars').getPublicUrl(fileName)

  avatarUrl.value = data.publicUrl

  const { error: updateError } = await supabase
    .from('profiles')
    .update({
      avatar_url: avatarUrl.value,
    })
    .eq('id', userId.value)

  if (updateError) {
    console.error(updateError)
  }
}

// =========================
// SAVED POSTS
// =========================

const loadSavedPosts = async () => {
  if (!userId.value) return

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

  savedPosts.value = (data || []).map((item: any) => item.posts).filter(Boolean)
}

// =========================
// FOLLOWERS
// =========================

const loadFollowers = async () => {
  if (!userId.value) return

  const { count } = await supabase
    .from('follows')
    .select('*', {
      count: 'exact',
      head: true,
    })
    .eq('following_id', userId.value)

  followers.value = count || 0
}

// =========================
// FOLLOWING
// =========================

const loadFollowing = async () => {
  if (!userId.value) return

  const { count } = await supabase
    .from('follows')
    .select('*', {
      count: 'exact',
      head: true,
    })
    .eq('follower_id', userId.value)

  following.value = count || 0
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
      highlight_stories (
        id,
        story_id,
        order_index
      )
    `,
    )
    .eq('user_id', userId.value)
    .order('created_at', { ascending: true })

  if (error) {
    console.error('Error loading highlights:', error)
    return
  }

  highlights.value = (data || []).map((highlight: any) => ({
    ...highlight,
    highlight_stories: (highlight.highlight_stories || []).sort(
      (a: any, b: any) => a.order_index - b.order_index,
    ),
  }))
}

const loadStories = async () => {
  if (!userId.value) return

  const { data, error } = await supabase
    .from('stories')
    .select('*')
    .eq('user_id', userId.value)
    .gt('expires_at', new Date().toISOString())
    .order('created_at', { ascending: false })

  if (error) {
    console.error('Error loading stories:', error)
    return
  }

  stories.value = data || []

  console.log('MY ACTIVE STORIES:', stories.value)
}

const createHighlight = async () => {
  if (!newHighlightTitle.value.trim()) {
    alert('Βάλε έναν τίτλο για το highlight')
    return
  }

  if (selectedStories.value.length === 0) {
    alert('Επίλεξε τουλάχιστον ένα story')
    return
  }

  const { data: highlight, error: highlightError } = await supabase
    .from('story_highlights')
    .insert({
      user_id: userId.value,
      title: newHighlightTitle.value.trim(),
      cover_story_id: selectedStories.value[0],
    })
    .select()
    .single()

  if (highlightError) {
    console.error(highlightError)
    alert(highlightError.message)
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

    // cleanup αν αποτύχει η εισαγωγή των stories
    await supabase.from('story_highlights').delete().eq('id', highlight.id)

    alert(storiesError.message)
    return
  }

  newHighlightTitle.value = ''
  selectedStories.value = []
  showCreateHighlight.value = false

  await loadHighlights()
}

const toggleStorySelection = (storyId: string) => {
  if (selectedStories.value.includes(storyId)) {
    selectedStories.value = selectedStories.value.filter((id) => id !== storyId)
  } else {
    selectedStories.value.push(storyId)
  }
}

const openMyStory = async () => {
  console.log('🟢 AVATAR CLICKED')
  console.log('USER ID:', userId.value)

  if (!userId.value) {
    console.error('❌ Δεν υπάρχει userId')
    return
  }

  // Πρώτα χρησιμοποιούμε το ήδη φορτωμένο story
  if (stories.value.length > 0) {
    myStory.value = stories.value[0]
    showMyStory.value = true

    console.log('✅ OPENING STORY:', myStory.value)
    return
  }

  // Fallback: ξανακάνουμε query
  const { data, error } = await supabase
    .from('stories')
    .select('*')
    .eq('user_id', userId.value)
    .gt('expires_at', new Date().toISOString())
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  console.log('STORY DATA:', data)
  console.log('STORY ERROR:', error)

  if (error) {
    console.error('❌ Error loading story:', error)
    return
  }

  if (!data) {
    alert('Δεν έχεις ενεργό story.')
    return
  }

  myStory.value = data
  showMyStory.value = true

  console.log('✅ STORY VIEWER OPEN:', myStory.value)
}

// =========================
// INIT
// =========================

onMounted(async () => {
  await loadProfile()
  await loadFollowers()
  await loadFollowing()
  await loadSavedPosts()
  await loadHighlights()
  await loadStories()
})
</script>

<template>
  <div class="profile-container">
    <!-- ================= PROFILE HEADER ================= -->

    <div class="profile-header">
      <!-- AVATAR - CLICK = STORY -->
      <div class="avatar" @click.stop="openMyStory">
        <img v-if="avatarUrl" :src="avatarUrl" alt="Avatar" />

        <span v-else>👤</span>
      </div>

      <!-- PROFILE INFO -->
      <div class="profile-info">
        <h1>{{ username || 'Username' }}</h1>

        <p class="email">
          {{ email }}
        </p>

        <p class="bio">
          {{ bio || 'No bio yet.' }}
        </p>

        <!-- STATS -->
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

        <!-- EDIT BUTTON -->
        <div v-if="!editing" class="profile-actions">
          <button class="edit-btn" @click="editing = true">Edit Profile</button>
        </div>

        <!-- EDIT PROFILE -->
        <div v-else class="edit-profile">
          <label class="change-avatar">
            Change profile picture

            <input type="file" accept="image/*" hidden @change="uploadAvatar" />
          </label>

          <input v-model="username" type="text" placeholder="Username" />

          <textarea v-model="bio" placeholder="Bio"></textarea>

          <div class="buttons">
            <button class="save-btn" @click="saveProfile">Save</button>

            <button class="cancel-btn" @click="editing = false">Cancel</button>
          </div>
        </div>
      </div>
    </div>

    <!-- SEPARATOR -->
    <hr />

    <!-- ================= HIGHLIGHTS ================= -->

    <section class="highlights-section">
      <div class="section-header">
        <h2>Highlights</h2>

        <button class="new-highlight-btn" @click="showCreateHighlight = true">+ New</button>
      </div>

      <div class="highlights-list">
        <!-- HIGHLIGHTS -->
        <div v-for="highlight in highlights" :key="highlight.id" class="highlight-item">
          <div class="highlight-cover">
            <span>✨</span>
          </div>

          <span class="highlight-title">
            {{ highlight.title }}
          </span>
        </div>

        <!-- EMPTY -->
        <div v-if="highlights.length === 0" class="empty-highlights">No highlights yet</div>
      </div>
    </section>

    <!-- ================= CREATE HIGHLIGHT MODAL ================= -->

    <div
      v-if="showCreateHighlight"
      class="highlight-modal-overlay"
      @click.self="showCreateHighlight = false"
    >
      <div class="highlight-modal">
        <h2>New Highlight</h2>

        <input v-model="newHighlightTitle" type="text" placeholder="Highlight name" />

        <h3>Select Stories</h3>

        <!-- STORY SELECTION -->
        <div class="story-selection">
          <div
            v-for="story in stories"
            :key="story.id"
            class="story-select"
            :class="{
              selected: selectedStories.includes(story.id),
            }"
            @click="toggleStorySelection(story.id)"
          >
            <!-- STORY IMAGE -->
            <img v-if="story.media_url" :src="story.media_url" alt="Story" />

            <!-- NO IMAGE -->
            <div v-else class="story-placeholder">📷</div>

            <!-- SELECTED CHECK -->
            <div v-if="selectedStories.includes(story.id)" class="selected-check">✓</div>
          </div>

          <!-- NO STORIES -->
          <div v-if="stories.length === 0" class="empty-highlights">No stories available.</div>
        </div>

        <!-- MODAL BUTTONS -->
        <div class="highlight-modal-buttons">
          <button class="cancel-btn" @click="showCreateHighlight = false">Cancel</button>

          <button class="create-btn" @click="createHighlight">Create</button>
        </div>
      </div>
    </div>

    <!-- ================= POSTS ================= -->

    <section class="posts-section">
      <div class="posts-header">
        <button :class="{ active: activeTab === 'posts' }" @click="activeTab = 'posts'">
          Posts
        </button>

        <button :class="{ active: activeTab === 'saved' }" @click="activeTab = 'saved'">
          Saved
        </button>
      </div>

      <!-- MY POSTS -->
      <div v-if="activeTab === 'posts'" class="posts-grid">
        <div v-for="post in posts" :key="post.id" class="post-card">
          <img v-if="post.image_url" :src="post.image_url" alt="Post" />

          <div v-else class="text-post">
            {{ post.content }}
          </div>
        </div>

        <div v-if="posts.length === 0" class="empty-state">No posts yet.</div>
      </div>

      <!-- SAVED POSTS -->
      <div v-if="activeTab === 'saved'" class="posts-grid">
        <div v-for="post in savedPosts" :key="post.id" class="post-card">
          <img v-if="post.image_url" :src="post.image_url" alt="Saved post" />

          <div v-else class="text-post">
            {{ post.content }}
          </div>
        </div>

        <div v-if="savedPosts.length === 0" class="empty-state">No saved posts yet.</div>
      </div>
    </section>

    <!-- ================= STORY VIEWER ================= -->

    <Teleport to="body">
      <div v-if="showMyStory && myStory" class="story-viewer" @click.self="showMyStory = false">
        <div class="story-viewer-content">
          <img
            v-if="myStory.media_url"
            :src="myStory.media_url"
            alt="My story"
            class="story-image"
          />

          <div v-else class="story-placeholder">No image</div>

          <button class="close-story" type="button" @click="showMyStory = false">✕</button>
        </div>
      </div>
    </Teleport>
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
  align-items: center;
  gap: 40px;
  margin-bottom: 35px;
}
.profile-info {
  flex: 1;
}
.profile-info h1 {
  margin: 0 0 8px;
  font-size: 30px;
  font-weight: 700;
  color: #111827;
}
.email {
  margin: 0 0 8px;
  color: #888;
  font-size: 14px;
}
.bio {
  margin: 0 0 20px;
  color: #555;
  font-size: 16px;
  line-height: 1.5;
}
.stats {
  display: flex;
  gap: 40px;
  margin-bottom: 20px;
}
.stats div {
  display: flex;
  flex-direction: column;
  align-items: center;
}
.stats strong {
  font-size: 21px;
  color: #111827;
}
.stats span {
  margin-top: 3px;
  color: #777;
  font-size: 14px;
}
.edit-btn,
.save-btn,
.cancel-btn,
.new-highlight-btn,
.create-btn {
  border: none;
  border-radius: 9px;
  color: white;
  font-weight: 600;
  cursor: pointer;
  transition: 0.2s;
}
.edit-btn {
  padding: 10px 24px;
  background: #2563eb;
}
.edit-btn:hover,
.save-btn:hover,
.new-highlight-btn:hover,
.create-btn:hover {
  background: #1d4ed8;
}
.edit-profile {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.edit-profile input,
.edit-profile textarea {
  width: 100%;
  box-sizing: border-box;
  padding: 12px 14px;
  border: 1px solid #ddd;
  border-radius: 9px;
  font-size: 15px;
  outline: none;
}
.edit-profile input:focus,
.edit-profile textarea:focus {
  border-color: #2563eb;
}
.edit-profile textarea {
  min-height: 100px;
  resize: vertical;
}
.buttons {
  display: flex;
  gap: 10px;
}
.save-btn,
.cancel-btn {
  padding: 10px 20px;
}
.save-btn {
  background: #2563eb;
}
.cancel-btn {
  background: #dc2626;
}
.cancel-btn:hover {
  background: #b91c1c;
}
hr {
  margin: 30px 0;
  border: none;
  border-top: 1px solid #e5e7eb;
}
.avatar {
  position: relative;
  flex-shrink: 0;
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
  border: 3px solid #2563eb;
  box-sizing: border-box;
  transition: 0.2s;
}
.avatar:hover {
  transform: scale(1.03);
  box-shadow: 0 0 0 4px rgba(37, 99, 235, 0.15);
}
.avatar img {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.avatar span {
  font-size: 55px;
}
.change-avatar {
  display: inline-block;
  width: fit-content;
  padding: 10px 16px;
  border-radius: 8px;
  background: #f1f5f9;
  color: #2563eb;
  font-weight: 600;
  cursor: pointer;
}
.change-avatar:hover {
  background: #e2e8f0;
}
.highlights-section {
  margin: 30px 0 45px;
}
.section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 20px;
}
.section-header h2 {
  margin: 0;
  font-size: 22px;
  color: #111827;
}
.new-highlight-btn {
  padding: 8px 16px;
  background: #2563eb;
}
.highlights-list {
  display: flex;
  gap: 24px;
  overflow-x: auto;
  padding: 5px 3px 10px;
  scrollbar-width: thin;
}
.highlight-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  min-width: 80px;
  cursor: pointer;
}
.highlight-cover {
  width: 78px;
  height: 78px;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  border-radius: 50%;
  background: #f3f4f6;
  border: 3px solid #fff;
  box-shadow: 0 0 0 2px #d1d5db;
  transition: 0.2s;
}
.highlight-item:hover .highlight-cover {
  transform: scale(1.05);
  box-shadow: 0 0 0 2px #2563eb;
}
.highlight-cover span {
  font-size: 28px;
}
.highlight-title {
  max-width: 85px;
  margin-top: 9px;
  overflow: hidden;
  color: #444;
  font-size: 13px;
  text-align: center;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.empty-highlights {
  padding: 15px 0;
  color: #888;
  font-size: 14px;
}
.highlight-modal-overlay {
  position: fixed;
  inset: 0;
  z-index: 9999;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
  background: rgba(0, 0, 0, 0.55);
  backdrop-filter: blur(3px);
}
.highlight-modal {
  width: 100%;
  max-width: 500px;
  max-height: 80vh;
  overflow-y: auto;
  padding: 25px;
  border-radius: 18px;
  background: #fff;
  box-shadow: 0 20px 50px rgba(0, 0, 0, 0.2);
  box-sizing: border-box;
}
.highlight-modal h2 {
  margin: 0 0 20px;
  text-align: center;
}
.highlight-modal h3 {
  margin: 20px 0 12px;
  font-size: 15px;
}
.highlight-modal > input {
  width: 100%;
  box-sizing: border-box;
  padding: 12px 14px;
  border: 1px solid #ddd;
  border-radius: 10px;
  outline: none;
}
.highlight-modal > input:focus {
  border-color: #2563eb;
}
.story-selection {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 12px;
}
.story-select {
  position: relative;
  aspect-ratio: 9 / 14;
  overflow: hidden;
  border: 3px solid transparent;
  border-radius: 10px;
  background: #eee;
  cursor: pointer;
}
.story-select img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.story-select.selected {
  border-color: #2563eb;
}
.story-placeholder {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #111;
  color: white;
}
.selected-check {
  position: absolute;
  top: 6px;
  right: 6px;
  width: 24px;
  height: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  background: #2563eb;
  color: #fff;
  font-weight: 700;
}
.highlight-modal-buttons {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  margin-top: 25px;
}
.create-btn {
  padding: 10px 20px;
  background: #2563eb;
}
.posts-section {
  margin-top: 20px;
}
.posts-header {
  display: flex;
  gap: 35px;
  margin-bottom: 25px;
  border-bottom: 1px solid #ddd;
}
.posts-header button {
  padding: 12px 5px;
  border: none;
  border-bottom: 3px solid transparent;
  background: none;
  color: #777;
  font-size: 16px;
  font-weight: 600;
  cursor: pointer;
}
.posts-header button.active {
  border-bottom-color: #2563eb;
  color: #2563eb;
}
.posts-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 15px;
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
  width: 100%;
  height: 100%;
  box-sizing: border-box;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
  text-align: center;
}
.empty-state {
  grid-column: 1 / -1;
  padding: 50px;
  color: #777;
  text-align: center;
}
.story-viewer {
  position: fixed;
  inset: 0;
  z-index: 99999;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
  box-sizing: border-box;
  background: rgba(0, 0, 0, 0.94);
  backdrop-filter: blur(4px);
}
.story-viewer-content {
  position: relative;
  width: min(420px, 92vw);
  height: min(750px, 90vh);
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  border-radius: 14px;
  background: #111;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
}
.story-image {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: contain;
  border-radius: 14px;
}
.story-viewer-content .story-placeholder {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  color: white;
  font-size: 20px;
  background: #111;
}
.close-story {
  position: absolute;
  top: 12px;
  right: 12px;
  z-index: 20;
  width: 45px;
  height: 45px;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  border: none;
  border-radius: 50%;
  background: rgba(0, 0, 0, 0.65);
  color: white;
  font-size: 25px;
  line-height: 1;
  cursor: pointer;
  transition: 0.2s;
}
.close-story:hover {
  background: rgba(255, 255, 255, 0.2);
  transform: scale(1.05);
}
@media (max-width: 650px) {
  .profile-container {
    margin: 20px auto;
    padding: 15px;
  }
  .profile-header {
    gap: 20px;
    align-items: flex-start;
  }
  .avatar {
    width: 100px;
    height: 100px;
  }
  .avatar span {
    font-size: 45px;
  }
  .profile-info h1 {
    font-size: 24px;
  }
  .stats {
    gap: 20px;
  }
  .posts-grid {
    gap: 5px;
  }
  .highlights-list {
    gap: 18px;
  }
  .story-selection {
    grid-template-columns: repeat(3, 1fr);
  }
  .story-viewer {
    padding: 10px;
  }
  .story-viewer-content {
    width: 100%;
    height: 90vh;
    max-width: 420px;
  }
  .close-story {
    top: 10px;
    right: 10px;
  }
}
@media (max-width: 430px) {
  .profile-header {
    gap: 15px;
  }
  .avatar {
    width: 85px;
    height: 85px;
  }
  .profile-info h1 {
    font-size: 21px;
  }
  .email {
    font-size: 12px;
  }
  .bio {
    font-size: 14px;
  }
  .stats {
    gap: 15px;
  }
  .stats strong {
    font-size: 18px;
  }
  .stats span {
    font-size: 12px;
  }
  .story-viewer-content {
    width: 100%;
    height: 90vh;
  }
}
</style>
