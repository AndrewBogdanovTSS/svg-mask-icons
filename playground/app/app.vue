<script setup lang="ts">
const showAccount = ref(false)
</script>

<template>
  <main style="font-size: 32px; color: rebeccapurple">
    <mask-icon name="arrow-circle" />
    <mask-icon name="arrow-circle" dir="down" />
    <!-- Variants of one icon, each a fragment of the same core sprite. -->
    <div>
      <mask-icon name="heart" variant="thin" :size="48" />
      <mask-icon name="heart" :size="48" />
      <mask-icon name="heart" variant="bold" :size="48" />
      <mask-icon name="heart" variant="solid" :size="48" />
    </div>
    <div>
      <mask-icon name="bookmark" variant="thin" :size="48" />
      <mask-icon name="bookmark" :size="48" />
      <mask-icon name="bookmark" variant="bold" :size="48" />
      <mask-icon name="bookmark" variant="solid" :size="48" />
    </div>
    <!-- The account group's sprite downloads only once this icon renders. -->
    <button type="button" @click="showAccount = true">
      Show account icon
    </button>
    <mask-icon v-if="showAccount" group="account" name="user-plus" />
  </main>
</template>
