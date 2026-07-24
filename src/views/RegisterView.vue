<script setup lang="ts">
import { ref } from 'vue'
import { supabase } from '@/lib/supabase'

const username = ref('')
const email = ref('')
const password = ref('')

const register = async () => {
  const { error } = await supabase.auth.signUp({
    email: email.value,
    password: password.value,
    options: {
      data: {
        username: username.value,
      },
    },
  })

  if (error) {
    alert(error.message)
    return
  }

  alert('Έλεγξε το email σου για επιβεβαίωση!')
}
</script>

<template>
  <div>
    <h1>Register</h1>

    <input v-model="username" type="text" placeholder="Username" />

    <br /><br />

    <input v-model="email" type="email" placeholder="Email" />

    <br /><br />

    <input v-model="password" type="password" placeholder="Password" />

    <br /><br />

    <button @click="register">Register</button>
  </div>
</template>
