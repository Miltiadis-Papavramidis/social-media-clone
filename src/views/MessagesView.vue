<script setup lang="ts">
import { supabase } from '@/lib/supabase'
import { useRouter } from 'vue-router'
import { ref, onMounted, onUnmounted, nextTick } from 'vue'
import EmojiPicker from 'vue3-emoji-picker'
import 'vue3-emoji-picker/css'
import type { RealtimeChannel } from '@supabase/supabase-js'

const router = useRouter()

type Profile = {
  id: string
  username: string
  avatar_url: string | null
}

type Message = {
  id: string
  sender_id: string
  content: string | null
  audio_url: string | null
  file_url: string | null
  file_name: string | null
  message_type: string
  delivered: boolean
  seen: boolean
  edited: boolean
  reply_to: string | null

  shared_post?: {
    id: string
    content: string
    image_url: string | null

    profiles: {
      username: string
      avatar_url: string | null
    }

    post_images: {
      image_url: string
    }[]
  }

  story?: {
    id: string
    media_url: string
  }

  stories?: {
    id: string
    media_url: string
    media_type: string
  }

  reply_message?: {
    id: string
    content: string
  }

  profiles?: {
    username: string
    avatar_url: string | null
  }

  message_reactions?: {
    id: string
    emoji: string
    user_id: string
  }[]
}

type Conversation = {
  id: string

  otherUser: Profile

  lastMessage: {
    content: string | null
    message_type: string
    created_at: string
  } | null
}

type PinnedMessage = {
  id: string
  content: string
  sender_id: string
}

const replyingTo = ref<Message | null>(null)
const conversations = ref<Conversation[]>([])
const currentUserId = ref('')
const selectedUser = ref<Profile | null>(null)
const conversationId = ref('')
const messages = ref<Message[]>([])
const messagesContainer = ref<HTMLElement | null>(null)
const newMessage = ref('')
const showEditModal = ref(false)
const editingMessage = ref<Message | null>(null)
const editedText = ref('')
const showMenu = ref(false)
const menuX = ref(0)
const menuY = ref(0)
const selectedMessage = ref<Message | null>(null)
const mediaRecorder = ref<MediaRecorder | null>(null)
const audioChunks = ref<Blob[]>([])
const isRecording = ref(false)
const fileInput = ref<HTMLInputElement | null>(null)
const previewImage = ref<string | null>(null)
const pinnedMessage = ref<PinnedMessage | null>(null)
const showEmojiPicker = ref(false)
const showConversationMenu = ref(false)
const selectedConversation = ref<Conversation | null>(null)
const conversationMenuX = ref(0)
const conversationMenuY = ref(0)

let channel: RealtimeChannel | null = null
let inboxChannel: RealtimeChannel | null = null

const openProfile = (id: string) => {
  router.push(`/profile/${id}`)
}

const openImage = (url: string | null) => {
  if (!url) return
  previewImage.value = url
}

const loadConversations = async () => {
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return

  currentUserId.value = user.id

  const { data: myMemberships, error } = await supabase
    .from('conversation_members')
    .select('conversation_id')
    .eq('user_id', user.id)

  if (error) {
    console.error(error)
    return
  }

  conversations.value = []

  for (const membership of myMemberships || []) {
    const convId = membership.conversation_id

    // Αν η συνομιλία είναι κρυμμένη
    const { data: hidden } = await supabase
      .from('hidden_conversations')
      .select('id, hidden_at')
      .eq('conversation_id', convId)
      .eq('user_id', currentUserId.value)
      .maybeSingle()

    // Μέλη συνομιλίας
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
      .eq('conversation_id', convId)

    const other = members?.find((m: any) => m.user_id !== currentUserId.value)

    if (!other) continue

    // Τελευταίο μήνυμα
    const { data: lastMessage } = await supabase
      .from('messages')
      .select('content,message_type,created_at')
      .eq('conversation_id', convId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    // Αν είναι hidden ΚΑΙ δεν υπάρχει νεότερο μήνυμα, μην το εμφανίσεις
    if (hidden && lastMessage && new Date(lastMessage.created_at) <= new Date(hidden.hidden_at)) {
      continue
    }

    conversations.value.push({
      id: convId,
      otherUser: other.profiles as Profile,
      lastMessage,
    })
  }

  conversations.value.sort((a, b) => {
    const da = a.lastMessage?.created_at || ''
    const db = b.lastMessage?.created_at || ''

    return db.localeCompare(da)
  })
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
  await loadPinnedMessage()

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
    ),
    stories:story_id(
      id,
      media_url,
      media_type
    ),
    shared_post:shared_post_id(
      id,
      content,
      image_url,
      user_id,
      profiles(
        username,
        avatar_url
      ),
      post_images(
        image_url
      )
    ),
    reply_message:reply_to(
      id,
      content
    ),
    message_reactions(
      id,
      emoji,
      user_id
    )
  `,
    )
    .eq('conversation_id', conversationId.value)
    .order('created_at')

  if (error) {
    console.error(error)
    return
  }

  messages.value = data ?? []

  console.log(messages.value)

  nextTick(() => {
    messagesContainer.value?.scrollTo({
      top: messagesContainer.value.scrollHeight,

      behavior: 'smooth',
    })
  })

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
  if (!newMessage.value.trim() || !conversationId.value) return

  // Αν η συνομιλία είναι κρυμμένη, την επαναφέρουμε
  await supabase
    .from('hidden_conversations')
    .delete()
    .eq('conversation_id', conversationId.value)
    .eq('user_id', currentUserId.value)

  const { error } = await supabase.from('messages').insert({
    conversation_id: conversationId.value,
    sender_id: currentUserId.value,
    content: newMessage.value,
    message_type: 'text',
    delivered: false,
    seen: false,
    edited: false,
    reply_to: replyingTo.value?.id ?? null,
  })

  if (error) {
    alert(error.message)
    return
  }

  newMessage.value = ''
  replyingTo.value = null

  // ανανέωση sidebar ώστε να εμφανιστεί αν ήταν κρυμμένη
  await loadConversations()
}

const startRecording = async () => {
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: true,
  })

  const recorder = new MediaRecorder(stream)

  audioChunks.value = []

  recorder.ondataavailable = (event) => {
    audioChunks.value.push(event.data)
  }

  recorder.onstop = uploadAudio

  recorder.start()

  mediaRecorder.value = recorder

  isRecording.value = true
}

const stopRecording = () => {
  mediaRecorder.value?.stop()

  mediaRecorder.value?.stream.getTracks().forEach((track) => track.stop())

  isRecording.value = false
}

const uploadAudio = async () => {
  if (!conversationId.value) return

  const blob = new Blob(audioChunks.value, {
    type: 'audio/webm',
  })

  const fileName = crypto.randomUUID() + '.webm'

  const { error: uploadError } = await supabase.storage
    .from('voice-messages')
    .upload(fileName, blob)

  if (uploadError) {
    console.error(uploadError)
    return
  }

  const { data } = supabase.storage.from('voice-messages').getPublicUrl(fileName)

  // Unhide conversation αν ήταν διαγραμμένη
  await supabase
    .from('hidden_conversations')
    .delete()
    .eq('conversation_id', conversationId.value)
    .eq('user_id', currentUserId.value)

  const { error } = await supabase.from('messages').insert({
    conversation_id: conversationId.value,
    sender_id: currentUserId.value,
    message_type: 'audio',
    audio_url: data.publicUrl,
    delivered: false,
    seen: false,
    edited: false,
    reply_to: replyingTo.value?.id ?? null,
  })

  if (error) {
    alert(error.message)
    return
  }

  replyingTo.value = null

  await loadConversations()
}

const uploadFile = async (event: Event) => {
  const input = event.target as HTMLInputElement

  if (!input.files?.length || !conversationId.value) return

  const file = input.files[0]

  if (file.size > 20 * 1024 * 1024) {
    alert('Maximum 20MB')
    return
  }

  const extension = file.name.split('.').pop()
  const fileName = `${crypto.randomUUID()}.${extension}`

  const { error: uploadError } = await supabase.storage.from('chat-files').upload(fileName, file)

  if (uploadError) {
    console.error(uploadError)
    return
  }

  const { data } = supabase.storage.from('chat-files').getPublicUrl(fileName)

  const type = file.type.startsWith('image/') ? 'image' : 'file'

  // Unhide conversation αν ήταν διαγραμμένη
  await supabase
    .from('hidden_conversations')
    .delete()
    .eq('conversation_id', conversationId.value)
    .eq('user_id', currentUserId.value)

  const { error } = await supabase.from('messages').insert({
    conversation_id: conversationId.value,
    sender_id: currentUserId.value,
    message_type: type,
    content: '',
    file_url: data.publicUrl,
    file_name: file.name,
    delivered: false,
    seen: false,
    edited: false,
    reply_to: replyingTo.value?.id ?? null,
  })

  if (error) {
    console.error(error)
    return
  }

  replyingTo.value = null
  input.value = ''

  await loadConversations()
}

const openMenu = (event: MouseEvent, message: Message) => {
  showEmojiPicker.value = false

  event.preventDefault()

  selectedMessage.value = message

  menuX.value = event.clientX
  menuY.value = event.clientY

  showMenu.value = true
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
        await loadConversations()
      },
    )
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'message_reactions',
      },
      async () => {
        await loadMessages()
      },
    )
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'conversations',
      },
      async () => {
        await loadPinnedMessage()
      },
    )
    .subscribe()
}

const editMessage = () => {
  if (!selectedMessage.value) return

  editingMessage.value = selectedMessage.value

  editedText.value = selectedMessage.value.content

  showEditModal.value = true

  showMenu.value = false
}

const saveEdit = async () => {
  if (!editingMessage.value) return

  const { error } = await supabase
    .from('messages')
    .update({
      content: editedText.value,
      edited: true,
    })
    .eq('id', editingMessage.value.id)

  if (error) {
    alert(error.message)
    return
  }

  showEditModal.value = false

  editingMessage.value = null
}

const cancelEdit = () => {
  showEditModal.value = false

  editingMessage.value = null
}

const deleteMessage = async () => {
  if (!selectedMessage.value) return

  const { error } = await supabase.from('messages').delete().eq('id', selectedMessage.value.id)

  if (error) {
    alert(error.message)
    return
  }

  showMenu.value = false
  selectedMessage.value = null
}

const closeMenu = () => {
  showMenu.value = false
  showEmojiPicker.value = false
  showConversationMenu.value = false
  selectedMessage.value = null
  selectedConversation.value = null
}

const replyToMessage = () => {
  if (!selectedMessage.value) return

  replyingTo.value = selectedMessage.value

  showMenu.value = false
}

const pinMessage = async (messageId: string) => {
  const { error } = await supabase
    .from('conversations')
    .update({
      pinned_message_id: messageId,
    })
    .eq('id', conversationId.value)

  if (error) {
    console.error(error)
    return
  }

  showMenu.value = false
  selectedMessage.value = null

  await loadPinnedMessage()
}

const unpin = async () => {
  await supabase
    .from('conversations')
    .update({
      pinned_message_id: null,
    })
    .eq('id', conversationId.value)

  pinnedMessage.value = null
}

const loadPinnedMessage = async () => {
  const { data } = await supabase
    .from('conversations')
    .select(
      `
      pinned_message_id,
      messages:pinned_message_id(
        id,
        content,
        sender_id
      )
    `,
    )
    .eq('id', conversationId.value)
    .single()

  pinnedMessage.value = data?.messages as PinnedMessage
}

const reactToMessage = async (emoji: string) => {
  if (!selectedMessage.value) return

  const { data: existing } = await supabase
    .from('message_reactions')
    .select('id, emoji')
    .eq('message_id', selectedMessage.value.id)
    .eq('user_id', currentUserId.value)
    .maybeSingle()

  if (existing) {
    // Αν πάτησε το ίδιο emoji -> remove
    if (existing.emoji === emoji) {
      await supabase.from('message_reactions').delete().eq('id', existing.id)
    } else {
      // Αν πάτησε άλλο -> update
      await supabase
        .from('message_reactions')
        .update({
          emoji,
        })
        .eq('id', existing.id)
    }
  } else {
    // Πρώτη φορά reaction
    await supabase.from('message_reactions').insert({
      message_id: selectedMessage.value.id,
      user_id: currentUserId.value,
      emoji,
    })
  }

  showMenu.value = false
  selectedMessage.value = null
}

const toggleReaction = async (reaction: any) => {
  // επιτρέπουμε να αφαιρέσει μόνο το δικό του reaction
  if (reaction.user_id !== currentUserId.value) return

  await supabase.from('message_reactions').delete().eq('id', reaction.id)
}

const selectEmoji = async (emoji: any) => {
  await reactToMessage(emoji.i)

  showEmojiPicker.value = false
}

const deleteConversation = async () => {
  const conversation = selectedConversation.value

  if (!conversation) return

  const { error } = await supabase.from('hidden_conversations').insert({
    conversation_id: conversation.id,
    user_id: currentUserId.value,
  })

  if (error) {
    console.error(error)
    return
  }

  if (conversationId.value === conversation.id) {
    selectedUser.value = null
    conversationId.value = ''
    messages.value = []
  }

  showConversationMenu.value = false
  selectedConversation.value = null

  await loadConversations()
}

const openConversationMenu = (event: MouseEvent, conversation: Conversation) => {
  event.preventDefault()
  event.stopPropagation()

  showMenu.value = false

  selectedConversation.value = conversation

  conversationMenuX.value = event.clientX
  conversationMenuY.value = event.clientY

  showConversationMenu.value = true
}

const subscribeInbox = () => {
  if (inboxChannel) {
    supabase.removeChannel(inboxChannel)
  }

  inboxChannel = supabase
    .channel('messages-sidebar')
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'messages',
      },
      async () => {
        await loadConversations()
      },
    )
    .subscribe()
}

onMounted(async () => {
  await loadConversations()

  subscribeInbox()

  window.addEventListener('click', closeMenu)
})

onUnmounted(() => {
  if (channel) {
    supabase.removeChannel(channel)
  }

  if (inboxChannel) {
    supabase.removeChannel(inboxChannel)
  }

  window.removeEventListener('click', closeMenu)
})
</script>

<template>
  <div class="messages-page">
    <!-- Sidebar -->
    <div class="sidebar">
      <h2>Messages</h2>

      <div
        v-for="conversation in conversations"
        :key="conversation.id"
        class="user-card"
        @click="openConversation(conversation.otherUser)"
        @contextmenu.prevent="openConversationMenu($event, conversation)"
      >
        <img
          v-if="conversation.otherUser.avatar_url"
          :src="conversation.otherUser.avatar_url"
          class="avatar"
        />

        <div v-else class="avatar-placeholder">👤</div>

        <div class="conversation-info">
          <strong>{{ conversation.otherUser.username }}</strong>

          <small v-if="conversation.lastMessage">
            {{
              conversation.lastMessage.message_type === 'text'
                ? conversation.lastMessage.content
                : conversation.lastMessage.message_type === 'image'
                  ? '📷 Photo'
                  : conversation.lastMessage.message_type === 'audio'
                    ? '🎤 Voice message'
                    : '📄 File'
            }}
          </small>
        </div>
      </div>
    </div>

    <!-- Chat -->
    <div class="chat">
      <template v-if="selectedUser">
        <!-- Header -->
        <div class="chat-header clickable" @click="openProfile(selectedUser.id)">
          <img
            v-if="selectedUser.avatar_url"
            :src="selectedUser.avatar_url"
            class="header-avatar"
          />

          <div v-else class="header-avatar placeholder">👤</div>

          <h2>{{ selectedUser.username }}</h2>
        </div>

        <div v-if="pinnedMessage" class="pinned">
          <span>📌 {{ pinnedMessage.content }}</span>

          <button @click="unpin">✕</button>
        </div>

        <!-- Messages -->
        <div ref="messagesContainer" class="messages">
          <div
            v-for="message in messages"
            :key="message.id"
            :class="[
              'message-row',
              message.sender_id === currentUserId ? 'mine-row' : 'theirs-row',
            ]"
          >
            <!-- Avatar άλλου -->
            <img
              v-if="message.sender_id !== currentUserId && message.profiles?.avatar_url"
              :src="message.profiles.avatar_url"
              class="message-avatar clickable"
              @click="openProfile(message.sender_id)"
            />

            <div v-else-if="message.sender_id !== currentUserId" class="message-avatar placeholder">
              👤
            </div>

            <!-- Bubble -->
            <div class="message-wrapper">
              <div
                :class="['message', message.sender_id === currentUserId ? 'mine' : 'theirs']"
                @contextmenu.prevent="openMenu($event, message)"
              >
                <div v-if="message.message_reactions?.length" class="reactions">
                  <span
                    v-for="reaction in message.message_reactions"
                    :key="reaction.id"
                    @click.stop="toggleReaction(reaction)"
                    class="reaction"
                  >
                    {{ reaction.emoji }}
                  </span>
                </div>

                <!-- Reply preview -->
                <div v-if="message.message_type === 'story_reply'" class="story-reply">
                  <div class="story-preview">
                    <img
                      v-if="message.stories?.media_type === 'image'"
                      :src="message.stories.media_url"
                    />

                    <video v-else :src="message.stories?.media_url" />
                  </div>

                  <div class="story-text">
                    {{ message.content }}
                  </div>
                </div>

                <div v-else-if="message.message_type === 'shared_post'" class="shared-post">
                  <div class="shared-header">
                    <img
                      v-if="message.shared_post?.profiles.avatar_url"
                      :src="message.shared_post.profiles.avatar_url"
                      class="shared-avatar"
                    />

                    <strong>
                      {{ message.shared_post?.profiles.username }}
                    </strong>
                  </div>

                  <p>
                    {{ message.shared_post?.content }}
                  </p>

                  <img
                    v-if="message.shared_post?.image_url"
                    :src="message.shared_post.image_url"
                    class="shared-image"
                  />

                  <img
                    v-else-if="message.shared_post?.post_images?.length"
                    :src="message.shared_post.post_images[0].image_url"
                    class="shared-image"
                  />
                </div>

                <!-- Message -->
                <div v-if="message.message_type === 'text'" class="message-text">
                  {{ message.content }}
                </div>

                <img
                  v-if="message.message_type === 'image'"
                  :src="message.file_url"
                  class="chat-image"
                  @click="openImage(message.file_url)"
                />
                <a
                  v-else-if="message.message_type === 'file'"
                  :href="message.file_url"
                  target="_blank"
                >
                  📄 {{ message.file_name }}
                </a>

                <audio
                  v-else-if="message.message_type === 'audio'"
                  controls
                  :src="message.audio_url"
                ></audio>

                <small v-if="message.edited" class="edited"> (edited) </small>
              </div>

              <!-- Status -->
              <div v-if="message.sender_id === currentUserId" class="message-status">
                <span v-if="message.seen">✓✓ Seen</span>
                <span v-else-if="message.delivered">✓✓ Delivered</span>
                <span v-else>✓ Sent</span>
              </div>
            </div>
          </div>
        </div>

        <div v-if="replyingTo" class="reply-preview">
          <strong>
            Replying to
            {{
              replyingTo.sender_id === currentUserId ? 'yourself' : replyingTo.profiles?.username
            }}
          </strong>

          <p>
            {{ replyingTo.content }}
          </p>

          <button @click="replyingTo = null">✕</button>
        </div>

        <!-- Input -->
        <div class="chat-input">
          <input v-model="newMessage" @keyup.enter="sendMessage" placeholder="Γράψε μήνυμα..." />

          <button v-if="!isRecording" @click="startRecording">🎤</button>

          <button v-else @click="stopRecording">⏹</button>

          <input ref="fileInput" type="file" hidden @change="uploadFile" />

          <button @click="sendMessage">Send</button>

          <button @click="fileInput?.click()">📎</button>
        </div>
      </template>

      <template v-else>
        <div class="empty-chat">
          <h2>Επίλεξε έναν χρήστη</h2>
        </div>
      </template>
    </div>

    <!-- Context Menu -->
    <div
      v-if="showMenu"
      class="context-menu"
      :style="{
        left: menuX + 'px',
        top: menuY + 'px',
      }"
    >
      <div class="emoji-picker-wrapper">
        <button @click.stop="showEmojiPicker = !showEmojiPicker">😀 React</button>

        <div v-if="showEmojiPicker" class="picker-popup" @click.stop>
          <EmojiPicker @select="selectEmoji" />
        </div>
      </div>
      <button @click="replyToMessage">↩️ Reply</button>

      <button v-if="selectedMessage" @click="pinMessage(selectedMessage.id)">📌 Pin</button>

      <template v-if="selectedMessage?.sender_id === currentUserId">
        <button @click="editMessage">✏️ Edit</button>

        <button @click="deleteMessage">🗑 Delete</button>
      </template>
    </div>

    <!-- Conversation Context Menu -->
    <div
      v-if="showConversationMenu"
      class="context-menu"
      :style="{
        left: conversationMenuX + 'px',
        top: conversationMenuY + 'px',
      }"
    >
      <button @click="deleteConversation">🗑 Delete chat</button>
    </div>

    <!-- Edit Modal -->
    <div v-if="showEditModal" class="modal-overlay">
      <div class="edit-modal">
        <h3>Edit message</h3>

        <textarea v-model="editedText" rows="4" autofocus></textarea>

        <div class="modal-actions">
          <button @click="cancelEdit">Cancel</button>

          <button @click="saveEdit">Save</button>
        </div>
      </div>
    </div>
    <div v-if="previewImage" class="image-modal" @click="previewImage = null">
      <img :src="previewImage" />
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
  display: flex;
  flex-direction: column;
  overflow: hidden;
  padding: 20px 30px;
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
  flex: 1;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-top: 20px;
  padding-bottom: 20px;
}

.message {
  padding: 8px;
  border-radius: 16px;
  max-width: 320px;
  overflow: hidden;
  position: relative;
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
  flex-shrink: 0;
  padding-top: 15px;
  border-top: 1px solid #eee;
  background: white;
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

.message-status span:first-child {
  color: #2563eb;
}

.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.35);
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 9999;
}

.edit-modal {
  width: 420px;
  background: white;
  border-radius: 12px;
  padding: 20px;
}

.edit-modal textarea {
  width: 100%;
  padding: 10px;
  margin-top: 15px;
  resize: none;
}

.modal-actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  margin-top: 15px;
}

.edited {
  font-size: 11px;
  opacity: 0.7;
  margin-top: 4px;
}

.context-menu {
  position: fixed;
  background: white;
  border-radius: 10px;
  box-shadow: 0 5px 20px rgba(0, 0, 0, 0.2);
  overflow: hidden;
  z-index: 9999;
}

.context-menu button {
  display: block;
  width: 160px;
  padding: 12px;
  border: none;
  background: white;
  text-align: left;
  cursor: pointer;
}

.context-menu button:hover {
  background: #f3f3f3;
}

.reply-preview {
  border-left: 3px solid #fff;
  padding-left: 8px;
  margin-bottom: 8px;
  font-size: 12px;
  opacity: 0.75;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.reply-preview p {
  margin: 2px 0 0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.theirs .reply-preview {
  background: #ddd;
  border-left: 3px solid #888;
}
.reply-box {
  border-left: 4px solid #4f6ef7;
  background: rgba(255, 255, 255, 0.15);
  padding: 6px 10px;
  border-radius: 8px;
  margin-bottom: 8px;
  font-size: 13px;
}

.mine .reply-box {
  background: rgba(255, 255, 255, 0.15);
  color: white;
}

.theirs .reply-box {
  background: #ddd;
  color: black;
}

.reply-box strong {
  display: block;
  margin-bottom: 3px;
  font-size: 12px;
}

.reply-box p {
  margin: 0;
  opacity: 0.9;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.message-text {
  padding: 8px;
  white-space: pre-wrap;
}

.chat-image {
  display: block;
  max-width: 260px;
  max-height: 320px;
  width: auto;
  height: auto;
  object-fit: cover;
  border-radius: 12px;
  cursor: pointer;
}

.image-modal {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.85);
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 99999;
}

.image-modal img {
  max-width: 90vw;
  max-height: 90vh;
  border-radius: 12px;
}

.message.image {
  background: transparent;
  padding: 0;
  box-shadow: none;
}

.pinned {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px;
  background: #fff8dc;
  border-left: 4px solid orange;
  margin-bottom: 12px;
  border-radius: 10px;
  font-weight: 600;
}

.emoji-picker {
  display: flex;
  justify-content: center;
  gap: 10px;
  padding: 10px;
  border-bottom: 1px solid #eee;
  padding: 0;
}

.emoji-picker span {
  font-size: 22px;
  cursor: pointer;

  transition: transform 0.15s;
}

.emoji-picker span:hover {
  transform: scale(1.25);
}

.reactions {
  position: absolute;
  bottom: -12px;
  right: 6px;
  display: flex;
  gap: 2px;
  background: white;
  border-radius: 20px;
  padding: 2px 6px;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.15);
}

.reactions span {
  background: white;
  border: 1px solid #ddd;
  border-radius: 20px;
  padding: 2px 6px;
  font-size: 14px;
}

.reaction {
  cursor: pointer;
  transition: 0.15s;
}

.reaction:hover {
  transform: scale(1.2);
}

.emoji-picker {
  padding: 0;
}

.conversation-info {
  display: flex;
  flex-direction: column;
  overflow: hidden;
  flex: 1;
}

.conversation-info strong {
  font-size: 15px;
}

.conversation-info small {
  color: #777;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.story-thumb {
  width: 46px;
  height: 46px;
  object-fit: cover;
  border-radius: 8px;
}

.story-reply {
  display: flex;
  align-items: center;
  gap: 10px;
}

.story-preview img,
.story-preview video {
  width: 55px;
  height: 80px;
  border-radius: 12px;
  object-fit: cover;
}

.story-text {
  font-size: 15px;
}

.shared-post {
  background: #f5f5f5;
  border-radius: 14px;
  overflow: hidden;
  max-width: 260px;
}

.shared-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px;
}

.shared-avatar {
  width: 30px;
  height: 30px;
  border-radius: 50%;
  object-fit: cover;
}

.shared-image {
  width: 100%;
  max-height: 260px;
  object-fit: cover;
}

.shared-post p {
  padding: 0 10px 10px;
  margin: 0;
}
</style>
