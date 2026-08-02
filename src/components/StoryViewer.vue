<script setup lang="ts">
import { ref, watch, onMounted, onUnmounted } from 'vue'

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
    </div>

    <div class="left" @click="previousStory"></div>

    <div class="right" @click="nextStory"></div>

    <button class="close" @click="$emit('close')">✕</button>
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
</style>
