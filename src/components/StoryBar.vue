<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { supabase } from '@/lib/supabase'
import StoryViewer from './StoryViewer.vue'

type StoryUser = {
  id: string
  username: string
  avatar_url: string | null
}

const myProfile = ref<StoryUser | null>(null)
const storyUsers = ref<StoryUser[]>([])
const fileInput = ref<HTMLInputElement | null>(null)
const hasMyStory = ref(false)
const viewerOpen = ref(false)
const viewerStories = ref([])
const viewerIndex = ref(0)

const loadStories = async () => {
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return

  // δικό μου profile
  const { data: me } = await supabase
    .from('profiles')
    .select('id, username, avatar_url')
    .eq('id', user.id)
    .single()

  myProfile.value = me

  // stories τελευταίων 24 ωρών
  const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()

  const { data, error } = await supabase
    .from('stories')
    .select(
      `
    id,
    user_id,
    media_url,
    media_type,
    profiles!stories_user_id_fkey(
      id,
      username,
      avatar_url
    )
  `,
    )
    .gte('created_at', yesterday)

  console.log(data)
  console.log(error)

  if (!data) return

  const myStories = data.filter((story: any) => story.user_id === user.id)

  hasMyStory.value = myStories.length > 0

  const uniqueUsers = new Map()

  data.forEach((story: any) => {
    if (!uniqueUsers.has(story.user_id)) {
      uniqueUsers.set(story.user_id, story.profiles)
    }
  })

  storyUsers.value = Array.from(uniqueUsers.values()).filter((u: any) => u.id !== user.id)
}

const uploadStory = () => {
  fileInput.value?.click()
}

const openStory = async (user: StoryUser) => {
  const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()

  const { data } = await supabase
    .from('stories')
    .select(
      `
      *,
      profiles!stories_user_id_fkey(
        id,
        username,
        avatar_url
      )
    `,
    )
    .eq('user_id', user.id)
    .gte('created_at', yesterday)
    .order('created_at')

  viewerStories.value = data || []

  viewerIndex.value = 0

  viewerOpen.value = true
}

const handleMyStoryClick = () => {
  if (hasMyStory.value) {
    openMyStory()
  } else {
    uploadStory()
  }
}

const openMyStory = async () => {
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return

  const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()

  const { data } = await supabase
    .from('stories')
    .select(
      `
      *,
      profiles!stories_user_id_fkey(
        id,
        username,
        avatar_url
      )
    `,
    )
    .eq('user_id', user.id)
    .gte('created_at', yesterday)
    .order('created_at')

  viewerStories.value = data || []

  viewerIndex.value = 0

  viewerOpen.value = true
}

const handleStoryUpload = async (event: Event) => {
  const target = event.target as HTMLInputElement

  if (!target.files?.length) return

  const file = target.files[0]

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return

  const fileName = `${user.id}/${Date.now()}-${file.name}`

  const { error: uploadError } = await supabase.storage.from('stories').upload(fileName, file)

  console.log(uploadError)

  if (uploadError) {
    alert(uploadError.message)
    return
  }

  const { data } = supabase.storage.from('stories').getPublicUrl(fileName)

  const isVideo = file.type.startsWith('video')

  const { error } = await supabase.from('stories').insert({
    user_id: user.id,
    media_url: data.publicUrl,
    media_type: isVideo ? 'video' : 'image',
  })

  if (error) {
    alert(error.message)
    return
  }

  await loadStories()

  target.value = ''
}
onMounted(loadStories)
</script>

<template>
  <div class="stories">
    <input
      ref="fileInput"
      type="file"
      hidden
      accept="image/*,video/*"
      @change="handleStoryUpload"
    />
    <div v-if="myProfile" class="story" @click="handleMyStoryClick">
      <div
        class="story-avatar"
        :class="{
          own: !hasMyStory,
          active: hasMyStory,
        }"
      >
        <img v-if="myProfile.avatar_url" :src="myProfile.avatar_url" />

        <div v-else class="placeholder">👤</div>

        <span class="plus"> + </span>
      </div>

      <small>Your Story</small>
    </div>

    <div v-for="user in storyUsers" :key="user.id" class="story" @click="openStory(user)">
      <div class="story-avatar">
        <img v-if="user.avatar_url" :src="user.avatar_url" />

        <div v-else class="placeholder">👤</div>
      </div>

      <small>
        {{ user.username }}
      </small>
    </div>
  </div>
  <StoryViewer
    v-if="viewerOpen"
    :stories="viewerStories"
    :startIndex="viewerIndex"
    @close="viewerOpen = false"
  />
</template>

<style scoped>
.stories {
  display: flex;

  gap: 18px;

  overflow-x: auto;

  padding: 15px 5px 25px;

  scrollbar-width: none;
}

.stories::-webkit-scrollbar {
  display: none;
}

.story {
  display: flex;
  flex-direction: column;
  align-items: center;

  cursor: pointer;

  flex-shrink: 0;
}

.story-avatar {
  width: 72px;
  height: 72px;

  border-radius: 50%;

  padding: 3px;

  background: linear-gradient(45deg, #f58529, #dd2a7b, #8134af, #515bd4);

  position: relative;
}

.story-avatar img {
  width: 100%;
  height: 100%;
  border-radius: 50%;
  object-fit: cover;
  border: 3px solid white;
}

.placeholder {
  width: 100%;
  height: 100%;
  border-radius: 50%;
  display: flex;
  justify-content: center;
  align-items: center;
  background: #ececec;
  font-size: 28px;
  border: 3px solid white;
}

.story small {
  margin-top: 8px;
  font-size: 13px;
  max-width: 80px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.own {
  background: #ddd;
}

.plus {
  position: absolute;
  bottom: 2px;
  right: 2px;
  width: 22px;
  height: 22px;
  border-radius: 50%;
  background: #2563eb;
  color: white;
  display: flex;
  justify-content: center;
  align-items: center;
  font-size: 18px;
  border: 2px solid white;
}
.active {
  background: linear-gradient(45deg, #f58529, #dd2a7b, #8134af, #515bd4);
}

.own {
  background: #ddd;
}
</style>
