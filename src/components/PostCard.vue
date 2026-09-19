<script setup lang="ts">
import { supabase } from '@/lib/supabase'
import { useRouter } from 'vue-router'
import { ref } from 'vue'
import CommentModal from './CommentModal.vue'
import SharePostModal from './SharePostModal.vue'

const router = useRouter()

type Post = {
  id: string
  user_id: string
  content: string
  image_url: string | null
  created_at: string

  profiles: {
    username: string
    avatar_url: string | null
  }

  post_images: {
    id: string
    image_url: string
  }[]
}

const openProfile = () => {
  console.log(props.post.user_id)
  router.push(`/profile/${props.post.user_id}`)
}

const props = defineProps<{
  post: Post
  currentUserId: string
  likes: number
  liked: boolean
  saved?: boolean
  comments: Number
  shares: Number
}>()

const emit = defineEmits<{
  deleted: [id: string]
  refresh: []
}>()

const showComments = ref(false)
const showShare = ref(false)
const currentImage = ref(0)

const toggleLike = async () => {
  let error

  if (props.liked) {
    const { error: deleteError } = await supabase
      .from('likes')
      .delete()
      .eq('post_id', props.post.id)
      .eq('user_id', props.currentUserId)

    error = deleteError
  } else {
    const { error: insertError } = await supabase.from('likes').insert({
      post_id: props.post.id,
      user_id: props.currentUserId,
    })

    error = insertError
  }

  if (error) {
    console.error(error)
    alert(error.message)
    return
  }

  emit('refresh')
}

const toggleSave = async () => {
  if (props.saved) {
    await supabase
      .from('saved_posts')
      .delete()
      .eq('post_id', props.post.id)
      .eq('user_id', props.currentUserId)
  } else {
    await supabase.from('saved_posts').insert({
      post_id: props.post.id,
      user_id: props.currentUserId,
    })
  }

  emit('refresh')
}

const deletePost = async () => {
  const confirmed = confirm('Θέλεις σίγουρα να διαγράψεις αυτό το post;')

  if (!confirmed) return

  const { error } = await supabase.from('posts').delete().eq('id', props.post.id)

  if (error) {
    console.error(error)
    return
  }

  emit('deleted', props.post.id)
}

const nextImage = () => {
  currentImage.value = (currentImage.value + 1) % props.post.post_images.length
}

const prevImage = () => {
  currentImage.value =
    (currentImage.value - 1 + props.post.post_images.length) % props.post.post_images.length
}
</script>

<template>
  <div class="post-card">
    <div class="post-header" @click="openProfile">
      <div class="user-info">
        <div class="avatar">
          <img v-if="post.profiles.avatar_url" :src="post.profiles.avatar_url" alt="Avatar" />

          <span v-else>👤</span>
        </div>

        <div>
          <h3>{{ post.profiles.username }}</h3>
          <small>{{ new Date(post.created_at).toLocaleString() }}</small>
        </div>
      </div>

      <button v-if="post.user_id === currentUserId" class="delete-btn" @click.stop="deletePost">
        🗑
      </button>
    </div>

    <div class="post-content">
      {{ post.content }}
    </div>

    <!-- Μία φωτογραφία -->
    <img v-if="post.image_url" :src="post.image_url" class="post-image" />

    <!-- Carousel -->
    <div v-else-if="post.post_images && post.post_images.length > 1" class="carousel">
      <button class="carousel-btn left" @click.stop="prevImage">‹</button>

      <img :src="post.post_images[currentImage].image_url" class="post-image" />

      <button class="carousel-btn right" @click.stop="nextImage">›</button>

      <div class="dots">
        <span
          v-for="(_, index) in post.post_images"
          :key="index"
          :class="{ active: index === currentImage }"
        />
      </div>
    </div>
    <div class="actions">
      <button class="icon-btn" @click="toggleLike">
        <span :class="{ liked }">♥</span>
      </button>

      <span>{{ likes }}</span>

      <button class="icon-btn" @click="showComments = true">💬</button>
       <span>{{ comments }}</span>

      <button class="icon-btn" @click="showShare = true">📤</button>
      <span>{{ shares }}</span>

      <button class="icon-btn" @click="toggleSave">
        <span :class="{ saved: saved }">🔖</span>
      </button>
    </div>

    <CommentModal
      v-if="showComments"
      :post="post"
      :current-user-id="currentUserId"
      @close="showComments = false"
    />
    <SharePostModal
      v-if="showShare"
      :post="post"
      :current-user-id="currentUserId"
      @close="showShare = false"
    />
  </div>
</template>

<style scoped>
.post-card {
  background: white;
  border-radius: 16px;
  padding: 20px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08);
}

.post-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 15px;
  cursor: pointer;
}

.user-info {
  display: flex;
  align-items: center;
  gap: 12px;
}

.avatar {
  width: 48px;
  height: 48px;
  border-radius: 50%;
  overflow: hidden;
  background: #ececec;

  display: flex;
  justify-content: center;
  align-items: center;
}

.avatar img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.avatar span {
  font-size: 22px;
}

.user-info h3 {
  margin: 0;
}

.user-info small {
  color: gray;
}

.post-content {
  margin: 18px 0;
  line-height: 1.6;
}

/* -------- Carousel -------- */

.carousel {
  position: relative;
  margin-bottom: 15px;
}

.post-image {
  width: 100%;
  border-radius: 14px;
  max-height: 600px;
  object-fit: cover;
}

.carousel-btn {
  position: absolute;
  top: 50%;
  transform: translateY(-50%);

  width: 42px;
  height: 42px;

  border: none;
  border-radius: 50%;

  background: rgba(0, 0, 0, 0.45);
  color: white;

  font-size: 24px;

  cursor: pointer;
}

.left {
  left: 12px;
}

.right {
  right: 12px;
}

.carousel-btn:hover {
  background: rgba(0, 0, 0, 0.7);
}

.dots {
  display: flex;
  justify-content: center;
  gap: 8px;

  margin-top: 12px;
}

.dots span {
  width: 9px;
  height: 9px;

  border-radius: 50%;

  background: #cfcfcf;
}

.dots span.active {
  background: royalblue;
}

/* -------- Actions -------- */

.actions {
  display: flex;
  align-items: center;
  gap: 15px;

  border-top: 1px solid #eee;
  padding-top: 15px;
}

.icon-btn {
  border: none;
  background: transparent;
  cursor: pointer;
  font-size: 24px;
}

.icon-btn:hover {
  transform: scale(1.1);
}

.icon-btn span {
  color: #bdbdbd;
}

.icon-btn span.liked {
  color: crimson;
}

.icon-btn span.saved {
  color: black;
}

.delete-btn {
  border: none;
  background: transparent;
  cursor: pointer;
  font-size: 20px;
}

.delete-btn:hover {
  color: red;
}
</style>
