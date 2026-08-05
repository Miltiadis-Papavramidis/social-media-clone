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

      <label class="upload-btn">
        📷 Add photos
        <input type="file" accept="image/*" multiple @change="handleImages" hidden />
      </label>

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
  max-width: 760px;
  margin: 0 auto;
  padding: 30px 20px 80px;
}

body {
  background: #f5f5f7;
}

.create-post {
  margin-top: 22px;
  background: white;
  border-radius: 18px;
  padding: 22px;
  border: 1px solid #ececec;
  box-shadow: 0 8px 25px rgba(0, 0, 0, 0.06);
}

.create-post h2 {
  margin: 0 0 18px;
  font-size: 22px;
  font-weight: 700;
}

.upload-btn{
    display:inline-flex;
    align-items:center;
    gap:8px;
    padding:10px 18px;
    background:#f3f4f6;
    border-radius:10px;
    cursor:pointer;
    transition:.2s;
}

.upload-btn:hover{
    background:#e5e7eb;
}

textarea{
    width:100%;
    min-height:110px;
    margin-top:18px;
    padding:14px 16px;
    border:1px solid #ddd;
    border-radius:14px;
    font-size:15px;
    outline:none;
    transition:.2s;
}

textarea:focus{
    border-color:#2563eb;
}

button{
    margin-top:18px;
    width:100%;
    padding:14px;
    border:none;
    border-radius:12px;
    background:#2563eb;
    color:white;
    font-size:15px;
    font-weight:600;
    cursor:pointer;
    transition:.2s;
}

button:hover{
    transform:translateY(-1px);
    background:#1d4ed8;
}

.posts{
    margin-top:30px;
    display:flex;
    flex-direction:column;
    gap:26px;
}
</style>
