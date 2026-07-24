<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { supabase } from '@/lib/supabase'

const emit = defineEmits(['close'])

const props = defineProps<{
  post: any
  currentUserId: string
}>()

type Comment = {
  id: string
  user_id: string
  content: string
  created_at: string

  profiles: {
    username: string
    avatar_url: string | null
  }
}

const comments = ref<Comment[]>([])
const newComment = ref('')
const editingCommentId = ref<string | null>(null)
const editedContent = ref('')

const loadComments = async () => {
  const { data, error } = await supabase
    .from('comments')
    .select(
      `
      *,
     profiles(
  username,
  avatar_url
)
    `,
    )
    .eq('post_id', props.post.id)
    .order('created_at')

  console.log('COMMENTS', data)
  console.log('ERROR', error)

  comments.value = data || []
}

const addComment = async () => {
  if (!newComment.value.trim()) return

  const { error } = await supabase.from('comments').insert({
    post_id: props.post.id,
    user_id: props.currentUserId,
    content: newComment.value,
  })

  console.log('INSERT ERROR:', error)

  if (error) {
    return
  }

  newComment.value = ''

  await loadComments()
}

const deleteComment = async (id: string) => {
  const { error } = await supabase.from('comments').delete().eq('id', id)

  if (error) {
    alert(error.message)
    return
  }

  await loadComments()
}

const startEdit = (comment: Comment) => {
  editingCommentId.value = comment.id
  editedContent.value = comment.content
}

const saveEdit = async () => {
  if (!editingCommentId.value) return

  const { error } = await supabase
    .from('comments')
    .update({
      content: editedContent.value,
    })
    .eq('id', editingCommentId.value)

  if (error) {
    alert(error.message)
    return
  }

  editingCommentId.value = null
  editedContent.value = ''

  await loadComments()
}

onMounted(loadComments)
</script>

<template>
  <div class="overlay" @click.self="emit('close')">
    <div class="modal">
      <button class="close" @click="emit('close')">✕</button>

      <div v-if="post.image_url">
        <img :src="post.image_url" class="post-image" />
      </div>

      <h3>{{ post.profiles.username }}</h3>

      <p class="post-content">
        {{ post.content }}
      </p>

      <hr />

      <div v-for="comment in comments" :key="comment.id" class="comment">
        <div class="comment-header">
          <div class="avatar-small">
            <img v-if="comment.profiles.avatar_url" :src="comment.profiles.avatar_url" />

            <span v-else>👤</span>
          </div>

          <div class="comment-body">
            <strong>{{ comment.profiles.username }}</strong>

            <template v-if="editingCommentId === comment.id">
              <textarea v-model="editedContent" rows="2"></textarea>

              <div class="edit-buttons">
                <button @click="saveEdit">Save</button>

                <button @click="editingCommentId = null">Cancel</button>
              </div>
            </template>

            <template v-else>
              <p>{{ comment.content }}</p>
            </template>
          </div>

          <div v-if="comment.user_id === currentUserId" class="comment-actions">
            <button @click="startEdit(comment)">✏️</button>

            <button @click="deleteComment(comment.id)">🗑</button>
          </div>
        </div>
      </div>

      <div class="new-comment">
        <input v-model="newComment" placeholder="Write a comment..." />

        <button @click="addComment">Post</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.overlay {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background: rgba(0, 0, 0, 0.55);
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 999;
}

.modal {
  background: white;
  width: 700px;
  max-height: 85vh;
  overflow: auto;
  border-radius: 16px;
  padding: 25px;
}

.close {
  float: right;
  border: none;
  background: none;
  font-size: 26px;
  cursor: pointer;
}

.post-image {
  width: 100%;
  border-radius: 10px;
  margin: 15px 0;
}

.comment {
  padding: 10px;
  margin-bottom: 10px;
  border-bottom: 1px solid #eee;
}

.new-comment {
  display: flex;
  gap: 10px;
  margin-top: 20px;
}

.new-comment input {
  flex: 1;

  padding: 10px;
}
.comment-header {
  display: flex;
  align-items: flex-start;
  gap: 12px;
}

.comment-body {
  flex: 1;
}

.comment-body p {
  margin: 4px 0 0;
}

.avatar-small {
  width: 42px;
  height: 42px;
  border-radius: 50%;
  overflow: hidden;

  background: #ececec;

  display: flex;
  justify-content: center;
  align-items: center;

  flex-shrink: 0;
}

.avatar-small img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.avatar-small span {
  font-size: 20px;
}

.comment-actions {
  display: flex;
  gap: 8px;
}

.comment-actions button {
  border: none;
  background: transparent;
  cursor: pointer;
  font-size: 18px;
}

.comment-actions button:hover {
  transform: scale(1.1);
}

.comment-body textarea {
  width: 100%;
  margin-top: 8px;
  padding: 8px;
  border-radius: 8px;
  border: 1px solid #ddd;
  resize: none;
}

.edit-buttons {
  display: flex;
  gap: 10px;
  margin-top: 8px;
}

.edit-buttons button {
  padding: 6px 12px;
  border: none;
  border-radius: 6px;
  cursor: pointer;
}
</style>
