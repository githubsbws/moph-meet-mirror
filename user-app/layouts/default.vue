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
        <div class="p-3">
            <slot />
        </div>
    </div>
  </template>
  