<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import { supabase } from '@/lib/supabase'

const props = defineProps({
  stories: {
    type: Array,
    required: true,
  },
  startIndex: {
    type: Number,
    default: 0,
  },
})

const emit = defineEmits(['close'])
const current = ref(props.startIndex)
const progress = ref(0)
const reply = ref('')

let timer: number

const startProgress = () => {
  progress.value = 0

  clearInterval(timer)

  timer = window.setInterval(() => {
    progress.value += 2

    if (progress.value >= 100) {
      nextStory()
    }
  }, 100)
}

const nextStory = () => {
  if (current.value < props.stories.length - 1) {
    current.value++
    startProgress()
  } else {
    emit('close')
  }
}

const previousStory = () => {
  if (current.value > 0) {
    current.value--
    startProgress()
  }
}

const keyHandler = (e: KeyboardEvent) => {
  if (e.key === 'Escape') emit('close')
}

const likeStory = async () => {
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return

  const storyId = props.stories[current.value].id

  const { data: existing } = await supabase
    .from('story_likes')
    .select('id')
    .eq('story_id', storyId)
    .eq('user_id', user.id)
    .maybeSingle()

  if (existing) {
    const { error } = await supabase
      .from('story_likes')
      .delete()
      .eq('story_id', storyId)
      .eq('user_id', user.id)

    if (error) console.error(error)
  } else {
    const { error } = await supabase.from('story_likes').insert({
      story_id: storyId,
      user_id: user.id,
    })

    if (error) console.error(error)
  }
}

const sendReply = async (text?: string) => {
  const message = text ?? reply.value

  if (!message.trim()) return

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return

  const ownerId = props.stories[current.value].user_id

  if (ownerId === user.id) return

  // Βρες όλα τα conversations του current user
  const { data: myConversations } = await supabase
    .from('conversation_members')
    .select('conversation_id')
    .eq('user_id', user.id)

  let conversationId: string | null = null

  for (const conv of myConversations || []) {
    const { data: members } = await supabase
      .from('conversation_members')
      .select('user_id')
      .eq('conversation_id', conv.conversation_id)

    if (members && members.length === 2 && members.some((m) => m.user_id === ownerId)) {
      conversationId = conv.conversation_id
      break
    }
  }

  // Αν δεν υπάρχει conversation, δημιούργησέ το
  if (!conversationId) {
    const { data: conversation, error } = await supabase
      .from('conversations')
      .insert({})
      .select()
      .single()

    if (error) {
      console.error(error)
      return
    }

    conversationId = conversation.id

    await supabase.from('conversation_members').insert([
      {
        conversation_id: conversationId,
        user_id: user.id,
      },
      {
        conversation_id: conversationId,
        user_id: ownerId,
      },
    ])
  }

  // Αν ο άλλος είχε κρύψει το chat δεν το πειράζουμε.
  // Αν το είχες κρύψει εσύ, το εμφανίζουμε ξανά.
  await supabase
    .from('hidden_conversations')
    .delete()
    .eq('conversation_id', conversationId)
    .eq('user_id', user.id)

  // Στείλε το μήνυμα
  const { error } = await supabase.from('messages').insert({
    conversation_id: conversationId,
    sender_id: user.id,
    content: message,
    message_type: 'story_reply',

    story_id: props.stories[current.value].id,

    delivered: false,
    seen: false,
    edited: false,
  })

  if (error) {
    console.error(error)
    return
  }

  reply.value = ''
}

const timeAgo = (date: string) => {
  const seconds = (Date.now() - new Date(date).getTime()) / 1000

  if (seconds < 60) return `${Math.floor(seconds)}s`

  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`

  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h`

  return `${Math.floor(seconds / 86400)}d`
}

const react = async (emoji: string) => {
  await sendReply(emoji)
}

startProgress()

onMounted(() => {
  window.addEventListener('keydown', keyHandler)
})

onUnmounted(() => {
  window.removeEventListener('keydown', keyHandler)
  clearInterval(timer)
})
</script>

<template>
  <div class="viewer">
    <div class="progress">
      <div class="bar" :style="{ width: progress + '%' }" />
    </div>

    <img
      v-if="stories[current]?.media_type === 'image'"
      :key="stories[current].id"
      :src="stories[current].media_url"
      class="story-image"
    />

    <video
      v-else-if="stories[current]"
      :key="stories[current].id"
      :src="stories[current].media_url"
      class="story-image"
      autoplay
      playsinline
      preload="auto"
      @ended="nextStory"
    />
    <div class="header">
      <img :src="stories[current]?.profiles?.avatar_url" class="avatar" />

      <span class="username">
        {{ stories[current]?.profiles?.username }}
      </span>

      <span class="time">
        {{ timeAgo(stories[current]?.created_at) }}
      </span>
    </div>

    <div class="left" @click="previousStory"></div>

    <div class="right" @click="nextStory"></div>

    <button class="close" @click="$emit('close')">✕</button>

    <div class="actions">
      <button @click="likeStory">❤️</button>

      <div class="reactions">
        <span @click="react('❤️')">❤️</span>
        <span @click="react('😂')">😂</span>
        <span @click="react('😍')">😍</span>
        <span @click="react('🔥')">🔥</span>
      </div>

      <div class="reply-box">
        <input v-model="reply" placeholder="Reply..." @keyup.enter="sendReply()" />
      </div>
    </div>
  </div>
</template>

<style scoped>
.viewer {
  position: fixed;
  inset: 0;
  background: black;
  z-index: 9999;
  display: flex;
  justify-content: center;
  align-items: center;
}

.story-image {
  max-width: 100%;
  max-height: 100%;
  object-fit: contain;
}

.progress {
  position: absolute;
  top: 20px;
  left: 20px;
  right: 20px;
  height: 3px;
  background: rgba(255, 255, 255, 0.2);
  border-radius: 5px;
  overflow: hidden;
}

.bar {
  height: 100%;
  background: white;
  transition: width 0.1s linear;
}
.left {
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  width: 40%;
  cursor: pointer;
}

.right {
  position: absolute;
  right: 0;
  top: 0;
  bottom: 0;
  width: 40%;
  cursor: pointer;
}

.close {
  position: absolute;
  top: 25px;
  right: 20px;
  background: none;
  border: none;
  font-size: 35px;
  color: white;
  cursor: pointer;
}

.header {
  position: absolute;
  top: 40px;
  left: 20px;
  display: flex;
  align-items: center;
  gap: 10px;
  z-index: 20;
  color: white;
  font-weight: 600;
}

.avatar {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  object-fit: cover;
}

.story-image {
  animation: fade 0.25s;
}

@keyframes fade {
  from {
    opacity: 0;
    transform: scale(0.98);
  }

  to {
    opacity: 1;
    transform: scale(1);
  }
}

.actions {
  position: absolute;
  bottom: 25px;
  left: 0;
  right: 0;

  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
}

.reactions {
  display: flex;
  gap: 10px;
}

.reactions span {
  font-size: 26px;
  cursor: pointer;
  transition: 0.2s;
}

.reactions span:hover {
  transform: scale(1.2);
}

.reply-box {
  width: 90%;
  max-width: 500px;
}

.reply-box input {
  width: 100%;
  padding: 12px 18px;
  border: none;
  border-radius: 999px;
  outline: none;
  font-size: 15px;
}

.actions button {
  background: transparent;
  border: none;
  font-size: 30px;
  cursor: pointer;
}

.time {
  opacity: 0.8;
  font-size: 14px;
}
</style>
