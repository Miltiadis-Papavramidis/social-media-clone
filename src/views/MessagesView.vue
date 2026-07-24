<script setup lang="ts">
import { supabase } from '@/lib/supabase'
import { useRouter } from 'vue-router'
import { ref, onMounted, onUnmounted } from 'vue'

const router = useRouter()

type Profile = {
  id: string
  username: string
  avatar_url: string | null
}

type Message = {
  id: string
  sender_id: string
  content: string

  delivered: boolean
  seen: boolean

  profiles: {
    username: string
    avatar_url: string | null
  }
}

const users = ref<Profile[]>([])
const currentUserId = ref('')
const selectedUser = ref<Profile | null>(null)
const conversationId = ref('')
const messages = ref<Message[]>([])
const newMessage = ref('')

let channel: any = null

const openProfile = (id: string) => {
  router.push(`/profile/${id}`)
}

const loadUsers = async () => {
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return

  currentUserId.value = user.id

  const { data, error } = await supabase
    .from('profiles')
    .select('id, username, avatar_url')
    .neq('id', user.id)

  if (error) {
    console.error(error)
    return
  }

  users.value = data || []
}

const openConversation = async (user: Profile) => {
  selectedUser.value = user

  // Ψάχνουμε αν υπάρχει ήδη conversation μεταξύ των δύο χρηστών
  const { data: myConversations } = await supabase
    .from('conversation_members')
    .select('conversation_id')
    .eq('user_id', currentUserId.value)

  if (!myConversations) return

  let existingConversationId: string | null = null

  for (const conv of myConversations) {
    const { data: members } = await supabase
      .from('conversation_members')
      .select('user_id')
      .eq('conversation_id', conv.conversation_id)

    if (members && members.length === 2 && members.some((m) => m.user_id === user.id)) {
      existingConversationId = conv.conversation_id
      break
    }
  }

  // Αν ΔΕΝ υπάρχει conversation, δημιουργούμε
  if (!existingConversationId) {
    const { data: conversation, error } = await supabase
      .from('conversations')
      .insert({})
      .select()
      .single()

    if (error) {
      console.error(error)
      return
    }

    existingConversationId = conversation.id

    await supabase.from('conversation_members').insert([
      {
        conversation_id: existingConversationId,
        user_id: currentUserId.value,
      },
      {
        conversation_id: existingConversationId,
        user_id: user.id,
      },
    ])
  }

  conversationId.value = existingConversationId

  await loadMessages()

  subscribeToMessages()
}

const loadMessages = async () => {
  if (!conversationId.value) return

  const { data, error } = await supabase
    .from('messages')
    .select(
      `
      *,
      profiles(
        username,
        avatar_url
      )
    `,
    )
    .eq('conversation_id', conversationId.value)
    .order('created_at')

  if (error) {
    console.error(error)
    return
  }

  messages.value = data || []

  // Delivered
  await supabase
    .from('messages')
    .update({
      delivered: true,
    })
    .eq('conversation_id', conversationId.value)
    .neq('sender_id', currentUserId.value)
    .eq('delivered', false)

  // Seen
  await supabase
    .from('messages')
    .update({
      seen: true,
    })
    .eq('conversation_id', conversationId.value)
    .neq('sender_id', currentUserId.value)
    .eq('seen', false)
}

const sendMessage = async () => {
  if (!newMessage.value.trim()) return
  if (!conversationId.value) return

  const { error } = await supabase.from('messages').insert({
    conversation_id: conversationId.value,
    sender_id: currentUserId.value,
    content: newMessage.value,
    delivered: false,
    seen: false,
  })

  if (error) {
    alert(error.message)
    return
  }

  newMessage.value = ''

  await loadMessages()
}

const subscribeToMessages = () => {
  if (!conversationId.value) return

  if (channel) {
    supabase.removeChannel(channel)
  }

  channel = supabase
    .channel(`conversation-${conversationId.value}`)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'messages',
        filter: `conversation_id=eq.${conversationId.value}`,
      },
      async () => {
        await loadMessages()
      },
    )
    .subscribe()
}

onMounted(() => {
  loadUsers()
})

onUnmounted(() => {
  if (channel) {
    supabase.removeChannel(channel)
  }
})
</script>

<template>
  <div class="messages-page">
    <!-- Sidebar -->
    <div class="sidebar">
      <h2>Messages</h2>

      <div v-for="user in users" :key="user.id" class="user-card" @click="openConversation(user)">
        <img v-if="user.avatar_url" :src="user.avatar_url" class="avatar" />

        <div v-else class="avatar-placeholder">👤</div>

        <span>{{ user.username }}</span>
      </div>
    </div>

    <!-- Chat -->
    <div class="chat">
      <template v-if="selectedUser">
        <div class="chat-header clickable" @click="openProfile(selectedUser!.id)">
          <img
            v-if="selectedUser.avatar_url"
            :src="selectedUser.avatar_url"
            class="header-avatar"
          />

          <div v-else class="header-avatar placeholder">👤</div>

          <h2>{{ selectedUser.username }}</h2>
        </div>

        <div
          v-for="message in messages"
          :key="message.id"
          :class="['message-row', message.sender_id === currentUserId ? 'mine-row' : 'theirs-row']"
        >
          <img
            v-if="message.sender_id !== currentUserId && message.profiles?.avatar_url"
            :src="message.profiles.avatar_url"
            class="message-avatar clickable"
            @click="openProfile(message.sender_id)"
          />

          <div v-else-if="message.sender_id !== currentUserId" class="message-avatar placeholder">
            👤
          </div>

          <!-- Bubble + Status -->
          <div class="message-wrapper">
            <div :class="['message', message.sender_id === currentUserId ? 'mine' : 'theirs']">
              {{ message.content }}
            </div>

            <div v-if="message.sender_id === currentUserId" class="message-status">
              <span v-if="message.seen"> ✓✓ Seen </span>

              <span v-else-if="message.delivered"> ✓✓ Delivered </span>

              <span v-else> ✓ Sent </span>
            </div>
          </div>
        </div>

        <div class="chat-input">
          <input v-model="newMessage" @keyup.enter="sendMessage" placeholder="Γράψε μήνυμα..." />

          <button @click="sendMessage">Send</button>
        </div>
      </template>

      <template v-else>
        <h2>Επίλεξε έναν χρήστη</h2>
      </template>
    </div>
  </div>
</template>

<style scoped>
.messages-page {
  display: flex;
  height: calc(100vh - 70px);
}

.sidebar {
  width: 300px;
  border-right: 1px solid #ddd;
  padding: 20px;
}

.user-card {
  display: flex;
  align-items: center;
  gap: 12px;

  padding: 12px;
  border-radius: 10px;
  cursor: pointer;
  margin-bottom: 10px;
}

.user-card:hover {
  background: #f3f3f3;
}

.chat {
  flex: 1;
  padding: 30px;
}

.avatar {
  width: 45px;
  height: 45px;
  border-radius: 50%;
  object-fit: cover;
}

.avatar-placeholder {
  width: 45px;
  height: 45px;

  border-radius: 50%;
  background: #ececec;

  display: flex;
  justify-content: center;
  align-items: center;

  font-size: 22px;
}

.messages {
  margin-top: 20px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.message {
  max-width: 60%;
  padding: 10px 15px;
  border-radius: 12px;
}

.mine {
  align-self: flex-end;
  background: #2563eb;
  color: white;
}

.theirs {
  align-self: flex-start;
  background: #ececec;
}
.chat-input {
  display: flex;
  gap: 10px;

  margin-top: 20px;
}

.chat-input input {
  flex: 1;

  padding: 12px;

  border: 1px solid #ddd;
  border-radius: 8px;
}

.chat-input button {
  padding: 12px 22px;

  border: none;
  border-radius: 8px;

  background: royalblue;
  color: white;

  cursor: pointer;
}

.chat-input button:hover {
  background: #1d4ed8;
}

.chat-header {
  display: flex;
  align-items: center;
  gap: 12px;

  padding-bottom: 15px;
  margin-bottom: 20px;

  border-bottom: 1px solid #eee;
}

.header-avatar {
  width: 48px;
  height: 48px;
  border-radius: 50%;
  object-fit: cover;
}

.message-row {
  display: flex;
  align-items: flex-end;
  margin-bottom: 12px;
}

.mine-row {
  justify-content: flex-end;
}

.theirs-row {
  justify-content: flex-start;
}

.message-avatar {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  object-fit: cover;
  margin-right: 10px;
}

.placeholder {
  display: flex;
  justify-content: center;
  align-items: center;
  background: #ececec;
}

.mine {
  background: royalblue;
  color: white;
}

.theirs {
  background: #ececec;
  color: black;
}

.message-status {
  font-size: 11px;
  color: gray;

  margin-top: 4px;
  text-align: right;
}

.message-wrapper {
  display: flex;
  flex-direction: column;
}

.mine-row .message-wrapper {
  align-items: flex-end;
}

.theirs-row .message-wrapper {
  align-items: flex-start;
}
.message-status {
  font-size: 11px;
  margin-top: 4px;
  color: #999;
}

.message-status span:first-child {
  color: #2563eb;
}
</style>
