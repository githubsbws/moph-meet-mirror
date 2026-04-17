<script setup>
const props = defineProps({
    user: {
        displayName: String,
        roles:[]
    }
})
</script>

<template>
    <div class="flex flex-col">
        <slot />
    </div>
  </template>
  