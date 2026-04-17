<script setup lang="js">
import { getData } from '~/functions/getData';
const props = defineProps({
    user: {
        displayName: String,
        roles: []
    }
})
const userFinding = ref([])
const userInvitees = ref([])
const patient = ref(null)
const invitees = ref([])
const title = ref('')
const starttime = ref('')
const endtime = ref('')
const inviteOnly = ref(true)

async function findUsers (ev) {
    if (ev.target.value) {
        userFinding.value = await getData(`/api/user/${ev.target.value}`, { method: 'get' })
    }
}
async function selectPatient(value){
    patient.value = value
}
async function removePatient(){
    patient.value = null
}

async function findInvitees (ev) {
    if (ev.target.value) {
        userInvitees.value = await getData(`/api/user/${ev.target.value}`, { method: 'get' })
    }
}
async function selectInvitees(value){
    invitees.value.push(value)
    invitees.value = [...new Set(invitees.value)]
}
async function removeInvitee(value){
    console.log(value)
    invitees.value = invitees.value.filter(r => r.username != value.username)
}
async function createMeeting(){
    const pacBody = {
        title: title.value,
        starttime: starttime.value,
        endtime: endtime.value,
        inviteOnly: inviteOnly.value,
        patient: patient.value?.username,
        invitees: [...invitees.value.map(r => r.username), props.user.username]
    }
    console.log(pacBody)
    getData('/api/meet/create', {
        method: 'post',
        body: JSON.stringify(pacBody)
    })
}


</script>

<template>
    <button
        onclick="meetCreateLater.showModal()"
        class="btn btn-secondary"
    >{{ $t('meetCreateLater') }}</button>
    <dialog
        id="meetCreateLater"
        class="modal modal-bottom sm:modal-middle"
    >
        <div class="modal-box">
            <h3 class="text-lg font-bold">{{ $t('examCreateInstanceModal') }}</h3>
            <div class="py-4 grid grid-cols-4 gap-1">
                <div class="self-center">{{$t('title')}}</div>
                <div class="col-span-3"><input
                        type="text"
                        class="input input-sm w-full bg-white"
                        v-model="title"
                        required
                    /></div>
                <div class="self-center">{{$t('starttime')}}</div>
                <div class="col-span-3"><input
                        type="datetime-local"
                        class="input input-sm w-full bg-white"
                        v-model="starttime"
                        required
                    /></div>
                <div class="self-center">{{$t('endtime')}}</div>
                <div class="col-span-3"><input
                        type="datetime-local"
                        class="input input-sm w-full bg-white"
                        v-model="endtime"
                        required
                    /></div>
                <div class="self-center">{{$t('inviteOnly')}}</div>
                <div class="col-span-3"><input
                        type="checkbox"
                        class="toggle toggle-sm my-1"
                        v-model="inviteOnly"
                        checked
                    /></div>

                <hr class="col-span-4" />

                <div class="self-center">{{$t('invitees')}}</div>
                <div class="col-span-3">
                    <div>
                        <span class="text-xs">{{ user.username }} {{ user.display }}</span> 
                    </div>
                    <div v-for="invitee of invitees">
                        <span class="text-xs">{{ invitee.username }} {{ invitee.display }}</span> 
                        <button @click="removeInvitee(invitee)">❌</button>
                    </div>
                    <input
                        type="text"
                        class="input input-sm w-full bg-white"
                        @keyup="findInvitees"
                    />
                    <div class="py-1" style="max-height:100px;overflow-y:auto;">
                        <button class="btn btn-xs w-full flex" v-for="user of userInvitees" @click="selectInvitees(user)">
                            <span class="w-24 text-left">{{ user.username }}</span>
                            <span class="grow text-left">{{ user.display }}</span>
                        </button>
                    </div>
                </div>
            </div>
            <div class="modal-action">
                <form method="dialog">
                    <button
                        class="btn btn-primary mx-3"
                        @click="createMeeting"
                    >{{ $t('createMeet') }}</button>
                    <button class="btn">{{$t('close')}}</button>
                </form>
            </div>
        </div>
    </dialog>
</template>