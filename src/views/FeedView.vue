<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { supabase } from '@/lib/supabase'
import PostCard from '@/components/PostCard.vue'
import Navbar from '@/components/NavBar.vue'
import StoryBar from '@/components/StoryBar.vue'

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

  likes: number
  liked: boolean
  saved: boolean

  post_images: {
    id: string
    image_url: string
    order_index: number
  }[]
}

const content = ref('')
const posts = ref<Post[]>([])
const currentUserId = ref('')
const images = ref<File[]>([])

const loadPosts = async () => {
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return

  const { data: postsData, error } = await supabase
    .from('posts')
    .select(
      `
      *,
      profiles(
        username,
        avatar_url
      ),
      post_images(
        id,
        image_url,
        order_index
      )
  `,
    )
    .order('created_at', { ascending: false })

  if (error) {
    console.error(error)
    return
  }

  const { data: savedPosts } = await supabase
    .from('saved_posts')
    .select('post_id')
    .eq('user_id', user.id)

  const savedIds = (savedPosts || []).map((s) => s.post_id)

  const postsWithLikes = await Promise.all(
    (postsData || []).map(async (post: any) => {
      const { count } = await supabase
        .from('likes')
        .select('*', {
          head: true,
          count: 'exact',
        })
        .eq('post_id', post.id)

      const { data: liked } = await supabase
        .from('likes')
        .select('id')
        .eq('post_id', post.id)
        .eq('user_id', user.id)

      post.post_images.sort((a: any, b: any) => a.order_index - b.order_index)

      return {
        ...post,

        likes: count || 0,

        liked: liked.length > 0,

        saved: savedIds.includes(post.id),
      }
    }),
  )

  posts.value = postsWithLikes
}

const handleImages = (event: Event) => {
  const target = event.target as HTMLInputElement

  if (!target.files) return

  images.value = Array.from(target.files)
}

const createPost = async () => {
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return

  if (images.value.length === 0) {
    alert('Διάλεξε φωτογραφία')
    return
  }

  if (images.value.length === 1) {
    const file = images.value[0]

    const fileName = `${Date.now()}-${file.name}`

    const { error: uploadError } = await supabase.storage.from('post-images').upload(fileName, file)

    if (uploadError) {
      alert(uploadError.message)
      return
    }

    const { data } = supabase.storage.from('post-images').getPublicUrl(fileName)

    await supabase.from('posts').insert({
      user_id: user.id,

      content: content.value,

      image_url: data.publicUrl,
    })
  } else {
    const { data: post, error } = await supabase
      .from('posts')
      .insert({
        user_id: user.id,

        content: content.value,

        image_url: null,
      })
      .select()
      .single()

    if (error) {
      alert(error.message)
      return
    }

    for (let i = 0; i < images.value.length; i++) {
      const file = images.value[i]

      const fileName = `${Date.now()}-${i}-${file.name}`

      const { error: uploadError } = await supabase.storage
        .from('post-images')
        .upload(fileName, file)

      if (uploadError) {
        alert(uploadError.message)
        return
      }

      const { data } = supabase.storage.from('post-images').getPublicUrl(fileName)

      await supabase.from('post_images').insert({
        post_id: post.id,

        image_url: data.publicUrl,

        order_index: i,
      })
    }
  }

  content.value = ''

  images.value = []

  await loadPosts()
}

onMounted(async () => {
  const {
    data: { user },
  } = await supabase.auth.getUser()

  currentUserId.value = user?.id || ''

  await loadPosts()
})
</script>

<template>
  <Navbar />

  <div class="feed-container">
    <StoryBar />
    <div class="create-post">
      <h2>Create Post</h2>

      <input type="file" accept="image/*" multiple @change="handleImages" />

      <textarea v-model="content" placeholder="Write a caption..."></textarea>

      <button @click="createPost">Share</button>
    </div>

    <div class="posts">
      <PostCard
        v-for="post in posts"
        :key="post.id"
        :post="post"
        :current-user-id="currentUserId"
        :likes="post.likes"
        :liked="post.liked"
        :saved="post.saved"
        @deleted="loadPosts"
        @refresh="loadPosts"
      />
    </div>
  </div>
</template>

<style scoped>
.feed-container {
  max-width: 700px;
  margin: auto;
  padding: 25px;
}

.create-post {
  margin-top: 20px;

  background: white;

  border-radius: 16px;

  padding: 20px;

  box-shadow: 0 3px 10px rgba(0, 0, 0, 0.08);
}

.create-post h2 {
  margin-bottom: 15px;
}

textarea {
  width: 100%;

  min-height: 120px;

  margin-top: 12px;

  padding: 12px;

  resize: none;

  border: 1px solid #ddd;

  border-radius: 10px;
}

button {
  margin-top: 15px;

  padding: 12px 24px;

  border: none;

  border-radius: 10px;

  background: #2563eb;

  color: white;

  cursor: pointer;
}

button:hover {
  background: #295edb;
}

.posts {
  display: flex;

  flex-direction: column;

  gap: 22px;

  margin-top: 25px;
}
</style>
