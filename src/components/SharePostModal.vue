<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { supabase } from '@/lib/supabase'

const props = defineProps<{
  post: {
    id: string
  }

  currentUserId: string
}>()

const emit = defineEmits(['close'])

const conversations = ref<any[]>([])
const search = ref('')

const filtered = computed(() =>
  conversations.value.filter((c) =>
    c.otherUser.username.toLowerCase().includes(search.value.toLowerCase()),
  ),
)

const loadConversations = async () => {
  const { data: memberships } = await supabase
    .from('conversation_members')
    .select('conversation_id')
    .eq('user_id', props.currentUserId)

  conversations.value = []

  for (const membership of memberships || []) {
    const { data: members } = await supabase
      .from('conversation_members')
      .select(
        `
        user_id,
        profiles(
          id,
          username,
          avatar_url
        )
      `,
      )
      .eq('conversation_id', membership.conversation_id)

    const other = members?.find((m: any) => m.user_id !== props.currentUserId)

    if (!other) continue

    conversations.value.push({
      id: membership.conversation_id,
      otherUser: other.profiles,
    })
  }
}

const share = async (conversationId: string) => {
  const { error } = await supabase.from('messages').insert({
    conversation_id: conversationId,
    sender_id: props.currentUserId,

    message_type: 'shared_post',

    shared_post_id: props.post.id,

    content: '',
    delivered: false,
    seen: false,
    edited: false,
  })

  if (error) {
    console.error(error)
    return
  }

  emit('close')
}

onMounted(loadConversations)
</script>

<template>
  <div class="overlay" @click.self="$emit('close')">
    <div class="modal">
      <h2>Share post</h2>

      <input v-model="search" placeholder="Search..." />

      <div class="list">
        <div v-for="conversation in filtered" :key="conversation.id" class="user">
          <div class="left">
            <img
              v-if="conversation.otherUser.avatar_url"
              :src="conversation.otherUser.avatar_url"
            />

            <div v-else class="avatar-placeholder">👤</div>

            <span>
              {{ conversation.otherUser.username }}
            </span>
          </div>

          <button @click="share(conversation.id)">Send</button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.55);
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 9999;
}

.modal {
  width: 420px;
  max-height: 600px;
  background: white;
  border-radius: 20px;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

h2 {
  text-align: center;
  padding: 20px;
  border-bottom: 1px solid #eee;
}

input {
  margin: 15px;
  padding: 12px;
  border-radius: 10px;
  border: 1px solid #ddd;
}

.list {
  overflow: auto;
}

.user {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 15px 20px;
}

.left {
  display: flex;
  align-items: center;
  gap: 12px;
}

img,
.avatar-placeholder {
  width: 45px;
  height: 45px;
  border-radius: 50%;
  object-fit: cover;
  background: #eee;
  display: flex;
  justify-content: center;
  align-items: center;
}

button {
  border: none;
  background: #0095f6;
  color: white;
  padding: 8px 18px;
  border-radius: 8px;
  cursor: pointer;
}

button:hover {
  background: #1877f2;
}
</style>
