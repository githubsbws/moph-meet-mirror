<script setup lang="js">
import { getData } from '~/functions/getData';
import html2canvas from 'html2canvas-pro'
const config = useRuntimeConfig()
definePageMeta({
    layout: 'meeting'
})

const route = useRoute()
const props = defineProps({
    user: {
        displayName: String,
        roles: []
    }
})
const meet = ref({})

onMounted(() => {
    init()
})

async function screenshot () {
    const screenshotTarget = document.getElementById('viewport')
    screenshotViewport.show()
    html2canvas(screenshotTarget).then((canvas) => {
        const base64image = canvas.toDataURL("image/png");
        document.getElementById('screenshotViewportImage').src = base64image
    })
}

async function init () {
    const data = await getData(`/api/exam/${route.params.id}`, { method: 'get' })

    meet.value = data
    
    const domain = config.public.meetingDomain;
    const options = {
        roomName: `${meet.value.id}-${meet.value.title}`,
        width: window.innerWidth,
        height: window.innerHeight - 64,
        parentNode: document.querySelector('#meet'),
        userInfo: {
            displayName: props.user.display
        }
    }

    new JitsiMeetExternalAPI(domain, options)
}
</script>

<template>
    <div class="h-screen">
        <div id="viewport">
            <div id="meet" class=""></div>
        </div>
        <div
            id="menu"
            class="block xl:hi h-16 w-screen fixed bottom-0 flex justify-center gap-3 p-2 bg-white shadow lg"
        >
            <button id="btn-meet" class="btn btn-primary">
                <Icon name="solar:call-chat-rounded-linear" size="1.5em" class="mx-1" />
                <span class="hidden md:inline">Video</span>
            </button>
            <button class="btn btn-primary btn-outline" @click="screenshot">
                <Icon name="solar:camera-outline" size="1.5em" class="mx-1" />
                <span class="hidden md:inline">Screenshot</span>
            </button>
        </div>
    </div>
    <dialog id="screenshotViewport" class="modal">
        <div class="modal-box">
            <h3 class="text-lg font-bold">Screenshot</h3>
            <img alt="screenshot" id="screenshotViewportImage" />
            <div class="modal-action">
                <form method="dialog">
                    <button class="btn">{{$t('close')}}</button>
                </form>
            </div>
        </div>
    </dialog>
</template>
