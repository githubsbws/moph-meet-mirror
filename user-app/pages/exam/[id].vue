<script setup lang="js">
import moment from 'moment';
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
const patientProfile = ref({})
const medRecords = ref({})
const iotRecords = ref({})
const patientID = ref()

let patientRecordTitle = ''
let patientRecordProfileContent = ''
let patientRecordHealthCheckContent = ''
let patientRecordAnalysisContent = ''
let patientRecordLabTestContent = ''
let patientRecordXRayContent = ''
let patientRecordContent = ''

onMounted(() => {
    init()
})
setInterval(() => {
    loadMedRec()
    loadIOTRec()
}, 1500);

async function submitRecord () {
    const body = {
        recordDate: new Date().toISOString(),
        title: patientRecordTitle,
        author: props.user.display,
        organization: "โรงพยาบาลบางกอกเว็บโซลูชั่น",
        content: patientRecordContent,
        profile: patientRecordProfileContent,
        healthcheck: patientRecordHealthCheckContent,
        analysis: patientRecordAnalysisContent,
        labtest: patientRecordLabTestContent,
        xraycontent: patientRecordXRayContent,
    }

    await getData(`/api/patient/${patientID.value}/med`, { method: 'post', body: JSON.stringify(body) })

    console.log(body)
    patientRecordTitle = ''
    patientRecordType = ''
    patientRecordProfileContent = ''
    patientRecordHealthCheckContent = ''
    patientRecordAnalysisContent = ''
    patientRecordLabTestContent = ''
    patientRecordXRayContent = ''
    patientRecordContent = ''
}

async function loadMedRec(){
    medRecords.value = await getData(`/api/patient/${patientID.value}/med`, { method: 'get' })
}

async function loadIOTRec(){
    iotRecords.value = await getData(`/api/patient/${patientID.value}/iot`, { method: 'get' })
}

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
    patientID.value = meet.value.patient?.uid
    patientProfile.value = { ...data.patient, prefix:undefined, name: `${data.patient?.prefix || ''} ${data.patient?.name} ${data.patient?.lastname || ''}`, lastname: undefined, id: undefined, uid: undefined, createdAt: undefined, updatedAt: undefined }

    await loadMedRec()
    await loadIOTRec()

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

    // new JitsiMeetExternalAPI(domain, options)

    const screens = [
        document.getElementById('meet'),
        document.getElementById('patientProfile'),
        document.getElementById('patientRecords'),
    ]

    document.getElementById('btn-meet').addEventListener('click', () => {
        screens[0].classList.remove('hidden')
        screens[1].classList.add('hidden')
        screens[2].classList.add('hidden')
        document.getElementById('btn-meet').classList = 'btn btn-primary'
        document.getElementById('btn-patientProfile').classList = 'btn btn-primary btn-outline'
        document.getElementById('btn-patientRecords').classList = 'btn btn-primary btn-outline'
    })
    document.getElementById('btn-patientProfile').addEventListener('click', () => {
        screens[0].classList.add('hidden')
        screens[1].classList.remove('hidden')
        screens[2].classList.add('hidden')
        document.getElementById('btn-meet').classList = 'btn btn-primary btn-outline'
        document.getElementById('btn-patientProfile').classList = 'btn btn-primary'
        document.getElementById('btn-patientRecords').classList = 'btn btn-primary btn-outline'

    })
    document.getElementById('btn-patientRecords').addEventListener('click', () => {
        screens[0].classList.add('hidden')
        screens[1].classList.add('hidden')
        screens[2].classList.remove('hidden')
        document.getElementById('btn-meet').classList = 'btn btn-primary btn-outline'
        document.getElementById('btn-patientProfile').classList = 'btn btn-primary btn-outline'
        document.getElementById('btn-patientRecords').classList = 'btn btn-primary'
    })
}
</script>

<template>
    <div class="h-screen">
        <div id="viewport" style="padding-bottom:90px;">
            <div id="meet" class=""></div>
            <div id="patientProfile" class="hidden p-2 container mx-auto">
                <PatientProfile />
                <!-- <div class="p-2">
                    <h2 class="text-2xl my-3">{{ $t('patientProfile') }}</h2>
                    <div class="card shadow bg-white p-4">
                        <table class="table-auto">
                            <tbody>
                                <tr v-for="[key, value] of Object.entries(patientProfile)">
                                    <td v-if="value">{{ $t(key) }}</td>
                                    <td v-if="value">{{ value }}</td>
                                </tr>
                            </tbody>
                        </table>
                    </div>
                    <div class="card shadow bg-white p-4 mt-3" style="max-height:60vh;overflow-y:scroll;">
                        <span v-if="user.roles?.includes('staff')  || user.sub">{{$t('writeRecord')}}</span>
                        <label class="form-control w-full">
                            <div class="label">
                                <span class="label-text">{{ $t('patientRecordTitle') }}</span>
                            </div>
                            <input type="text" placeholder="Type here" class="input input-bordered w-full" v-model="patientRecordTitle">
                        </label>
                        <label class="form-control">
                            <div class="label">
                                <span class="label-text">{{$t('patientRecordProfile')}}</span>
                            </div>
                            <textarea class="textarea textarea-bordered h-24" v-model="patientRecordProfileContent" ></textarea>
                        </label>
                        <label class="form-control">
                            <div class="label">
                                <span class="label-text">{{$t('patientRecordHealthCheck')}}</span>
                            </div>
                            <textarea class="textarea textarea-bordered h-24" v-model="patientRecordHealthCheckContent" ></textarea>
                        </label>
                        <label class="form-control">
                            <div class="label">
                                <span class="label-text">{{$t('patientRecordAnalysis')}}</span>
                            </div>
                            <textarea class="textarea textarea-bordered h-24" v-model="patientRecordAnalysisContent" ></textarea>
                        </label>
                        <label class="form-control">
                            <div class="label">
                                <span class="label-text">{{$t('patientRecordLabTest')}}</span>
                            </div>
                            <textarea class="textarea textarea-bordered h-24" v-model="patientRecordLabTestContent" ></textarea>
                        </label>
                        <label class="form-control">
                            <div class="label">
                                <span class="label-text">{{$t('patientRecordXRay')}}</span>
                            </div>
                            <textarea class="textarea textarea-bordered h-24" v-model="patientRecordXRayContent" ></textarea>
                        </label>
                        <label class="form-control">
                            <div class="label">
                                <span class="label-text">{{$t('patientRecord')}}</span>
                            </div>
                            <textarea class="textarea textarea-bordered h-24" v-model="patientRecordContent" ></textarea>
                        </label>
                        <button @click="submitRecord" class="my-2 btn btn-primary">{{ $t('submitRecord') }}</button>
                    </div>
                </div>
                <div class="p-2 xl:col-span-2">
                    <iframe src="https://phr1.moph.go.th/phr/" style="width:100%; height: 90vh;"></iframe>
                    <h2 class="text-2xl my-3">{{ $t('medicalRecordContent') }}</h2>
                    <div class="grid grid-cols-1 lg:grid-cols-2 gap-2" style="padding-bottom: 64px">                        
                        <div
                            class="card shadow bg-white p-4 grid grid-cols-2"
                            v-for="record of medRecords"
                        >
                            <div>
                                <span class="text-2xl">{{ record.title }} </span><br />
                            </div>
                            <span class="text-sm text-right">{{
                                moment(record.recordDate).format('MMMM Do YYYY HH:mm')
                            }}</span>
                            <div class="col-span-2 my-2">
                                <span>{{ $t('patientRecordProfile') }}</span>
                                <p class="card bg-base-100 p-3">
                                    {{ record.profile || '-' }}
                                </p>
                            </div>
                            <div class="col-span-2 my-2">
                                <span>{{ $t('patientRecordHealthCheck') }}</span>
                                <p class="card bg-base-100 p-3">
                                    {{ record.healthcheck || '-' }}
                                </p>
                            </div>
                            <div class="col-span-2 my-2">
                                <span>{{ $t('patientRecordAnalysis') }}</span>
                                <p class="card bg-base-100 p-3">
                                    {{ record.analysis || '-' }}
                                </p>
                            </div>
                            <div class="col-span-2 my-2">
                                <span>{{ $t('patientRecordLabTest') }}</span>
                                <p class="card bg-base-100 p-3">
                                    {{ record.labtest || '-' }}
                                </p>
                            </div>
                            <div class="col-span-2 my-2">
                                <span>{{ $t('patientRecordXRay') }}</span>
                                <p class="card bg-base-100 p-3">
                                    {{ record.xraycontent || '-' }}
                                </p>
                            </div>
                            <div class="col-span-2 my-2">
                                <span>{{ $t('patientRecord') }}</span>
                                <p class="card bg-base-100 p-3">
                                    {{ record.content || '-' }}
                                </p>
                            </div>
                            <span class="text-sm">{{ record.author }}</span>
                            <span class="text-sm text-right">{{ record.organization }}</span>
                        </div>
                    </div>
                </div> -->
            </div>
            <div id="patientRecords" class="hidden pb-5">
                <div class="p-2 container mx-auto">
                    <MedDevices :patientID="patientID" />
                    <h2 class="text-2xl my-3">{{ $t('medicalDeviceRecords') }}</h2>
                    <div
                        class="mx-auto grid lg:grid-cols-2 xl:grid-cols-3 gap-2"
                        style="padding-bottom: 64px"
                    >
                        <div v-for="record of iotRecords" :class="record.key === 'img' ? 'lg:col-span-2 xl:col-span-3': ''">
                            <div class="card shadow bg-white p-4 grid" v-if="record.key === 'img'">
                                <img :src="record.value" class="w-full max-h-96" />
                            </div>
                            <div
                                class="card shadow bg-white p-4 grid grid-cols-2"
                                v-else
                            >
                                <span class="text-lg">{{ record.key }}</span>
                                <span class="text-sm text-right">
                                    {{ moment(record.createdAt).format('YYYY/MM/DD HH:mm:ss') }}
                                </span>
                                <span class="text-3xl col-span-2 my-3 text-center">
                                    {{ record.value }}
                                </span>
                                <span class="text-lg">
                                    {{ record.type }}
                                    <span class="text-xs">{{ record.deviceID }}</span>
                                </span>
                                <span class="text-lg text-right">{{ record.organization }}</span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
        <div
            id="menu"
            class="block xl:hi h-16 w-screen fixed bottom-0 flex justify-center gap-3 p-2 bg-white shadow lg"
        >
            <button id="btn-meet" class="btn btn-primary">
                <Icon name="solar:call-chat-rounded-linear" size="1.5em" class="mx-1" />
                <span class="hidden md:inline capitalize">{{ $t('video') }}</span>
            </button>
            <a class="btn btn-primary btn-outline" href="https://phr1.moph.go.th/phr/" target="_blank">
                <Icon name="solar:user-id-linear" size="1.5em" class="mx-1" />
                <span class="hidden md:inline capitalize">{{ $t('PHR') }}</span>
            </a>
            
            <button id="btn-patientProfile" class="btn btn-primary btn-outline">
                <Icon name="solar:user-id-linear" size="1.5em" class="mx-1" />
                <span class="hidden md:inline capitalize">{{ $t('profile') }}</span>
            </button>
            <button id="btn-patientRecords" class="btn btn-primary btn-outline">
                <Icon name="solar:washing-machine-linear" size="1.5em" class="mx-1" />
                <span class="hidden md:inline capitalize">{{ $t('medDevices') }}</span>
            </button>
            <button class="btn btn-primary btn-outline" @click="screenshot">
                <Icon name="solar:camera-outline" size="1.5em" class="mx-1" />
                <span class="hidden md:inline capitalize">{{ $t('screenshot') }}</span>
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
