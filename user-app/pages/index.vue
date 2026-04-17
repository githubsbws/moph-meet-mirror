<script setup lang="js">
import moment from 'moment'
import CreateExamSession from '~/components/CreateExamSession'
import CreateMeetingSession from '~/components/CreateMeetingSession'
import { getData } from '~/functions/getData';
import { sanitizeUrl } from '@braintree/sanitize-url'
import Dashboard from '~/components/Dashboard'

const props = defineProps({
    user: {
        displayName: String,
        roles: []
    }
})
const config = useRuntimeConfig()

const isLoading = ref(false)
const meets = ref([])
const filteredMeets = ref([])
const latestMeet = ref([])
const searchText = useTemplateRef('searchText')
const attributes = ref([])
const noti = ref([
    // { id: 1000, message: 'test message from dev', by: 'system', link: null }
])
const userFinding = ref([])
const date = ref()

const instanceMeet = ref('')

async function fetchMeets () {
    meets.value = await fetch(`${config.public.apiBase}/api/meets`, {
        method: 'get',
        headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${sessionStorage.getItem('session-token')}`
        }
    })
        .then(r => {
            if (r.status === 200) return r.json()
            logout()
        })

    attributes.value = meets.value.map(meet => ({
        key: meet.id,
        dot: meet.patientId ?
            {
                style: {
                    backgroundColor: '#288d5c',
                },
            } :
            {
                style: {
                    backgroundColor: '#ffee53',
                },
            },
        dates: moment(meet.starttime).toDate(),
    }))

    latestMeet.value = meets.value.length > 0 ? meets.value[0] : undefined
    isLoading.value = true
    await filterMeet()
}

async function filterMeet () {
    isLoading.value = true
    const txt = searchText.value?.value || ''
    filteredMeets.value = meets.value.filter(r =>
        (r.title.toLowerCase().includes(txt.toLowerCase()) || r.description.toLowerCase().includes(txt.toLowerCase())) &&
        (!date.value || moment(date.value).isSame(moment(r.starttime), 'date'))
    )
    isLoading.value = false
}

async function logout () {
    getData('/api/logout', {
        method: 'post',
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: sessionStorage.getItem('session-token') })
    }).then(() => {
        sessionStorage.clear('session-token')
        sessionStorage.clear('session-user')
        window.location.reload()
    })
}

async function findUsers (ev) {
    if (ev.target.value) {
        userFinding.value = await getData(`/api/user/${ev.target.value}`, { method: 'get' })
    }
}

onMounted(() => {
    fetchMeets()
})
</script>

<template>
    <div class="grid grid-cols-2 lg:grid-cols-6 container mx-auto gap-2">
        <div class="col-span-1 order-0">
            <img
                alt="MOPH meet logo" 
                src="/assets/images/logo.png"
                class="h-8 lg:h-16 my-3"
            />
        </div>
        <div class="hidden lg:block lg:col-span-3">&nbsp;</div>
        <div class="col-span-1 order-0 flex justify-end lg:justify-start gap-2">
            <button
                v-if="user.roles?.includes('staff') || user.sub"
                class="btn self-end"
                onclick="userSearch.showModal()"
            >
                <Icon name="solar:rounded-magnifer-outline"></Icon>
                <span>{{ $t('searchUser') }}</span>
            </button>
            <button
                v-if="user.roles?.includes('admin')"
                class="btn self-end"
                onclick="dashboardModal.showModal()"
            >
                <Icon name="solar:graph-new-bold"></Icon>
                <span>{{ $t('Dashboard') }}</span>
            </button>
            <dialog
                id="dashboardModal"
                class="modal modal-bottom sm:modal-middle"
            >
                <div class="modal-box bg-base-600" style>
                    <Dashboard />
                    <div class="modal-action">
                        <form method="dialog">
                            <button class="btn">{{$t('close')}}</button>
                        </form>
                    </div>
                </div>
            </dialog>
            <dialog
                id="userSearch"
                class="modal modal-bottom sm:modal-middle"
            >
                <div class="modal-box bg-base-600">
                    <h3 class="text-lg font-bold py-3">{{ $t('searchMemberModal') }}</h3>
                    <label class="input flex items-center gap-2 bg-white">
                        <input
                            type="text"
                            class="grow"
                            :placeholder="$t('searchUser')"
                            @keyup.stop="findUsers"
                        />
                        <Icon name="solar:rounded-magnifer-outline" />
                    </label>
                    <div class="flex flex-col mt-2 py-2 gap-2 h-96 overflow-y-scroll">
                        <div
                            class="card w-full p-2 flex flex-row gap-2 bg-white"
                            v-for="user of userFinding"
                        >
                            <div class="flex-grow">
                                <span class="capitalize">{{ user.display }}</span>
                                <br />
                                <span class="text-xs capitalize">
                                    {{ user.roleMaps.map(r => r.roleName).join(', ') }}
                                </span>
                            </div>
                            <div class="place-items-center flex">
                                <Icon
                                    name="solar:user-check-bold"
                                    class="text-green-600 transition"
                                    size="2em"
                                    v-if="user.isOnline"
                                ></Icon>
                                <Icon
                                    name="solar:user-cross-bold"
                                    class="text-red-600 transition"
                                    size="2em"
                                    v-else
                                ></Icon>
                            </div>
                            <div class="place-items-center flex">
                                <Icon
                                    name="solar:user-id-linear"
                                    class="hover:text-primary transition cursor-pointer"
                                    size="2em"
                                ></Icon>
                            </div>
                            <div class="place-items-center flex">
                                <Icon
                                    name="solar:calendar-add-linear"
                                    class="hover:text-primary transition cursor-pointer"
                                    size="2em"
                                ></Icon>
                            </div>
                        </div>
                    </div>
                    <div class="modal-action">
                        <form method="dialog">
                            <button class="btn">{{$t('close')}}</button>
                        </form>
                    </div>
                </div>
            </dialog>
        </div>
        <div class="grid grid-cols-2 lg:grid-cols-6 col-span-2 lg:col-span-6 gap-2">
            <div class="col-span-2 order-3 lg:order-1">
                <a
                    class="card bg-primary text-white hover:shadow-lg transition h-full"
                    v-if="latestMeet"
                    :href="sanitizeUrl(latestMeet.patientId ? `/exam/${latestMeet.id}` : `/meet/${latestMeet.id}`)"
                >
                    <div class="card-body">
                        <span class="text-xl font-bold">{{ moment().isBefore(latestMeet.starttime) ? $t('upcoming'): $t('onGoing') }}</span>
                        <span class="">{{ latestMeet.title }}</span>
                        <span>{{ latestMeet.description }}</span>
                        <hr />
                        <div class="grid grid-cols-2">
                            <div class="flex">
                                <Icon
                                    name="solar:calendar-outline"
                                    size="1.3em"
                                    class="mx-1"
                                />
                                <span class="text-sm">
                                    {{ moment(latestMeet.starttime).format('MMMM Do YYYY') }}
                                </span>
                            </div>
                            <div class="flex">
                                <Icon
                                    name="solar:clock-circle-linear"
                                    size="1.3em"
                                    class="mx-1"
                                />
                                <span class="text-sm">
                                    {{ moment(latestMeet.starttime).format('HH:mm') }} -
                                    {{ moment(latestMeet.endtime).format('HH:mm') }}
                                </span>
                            </div>
                        </div>
                    </div>
                </a>
                <div
                    class="text-center h-full"
                    v-else
                >
                    <div class="card bg-base-300 h-full">
                        <div class="card-body">
                            {{ $t('noMeet') }}
                        </div>
                    </div>
                </div>
            </div>
            <div class="col-span-2 lg:col-span-2 order-3 lg:order-2">
                <div class="card bg-white">
                <div class="card-body" v-if="user.roles?.includes('staff') || user.sub">
                    <span class="text-xl">{{ $t('createNewMeet') }}</span>
                    <div class="grid grid-cols-2 gap-2">
                        <button
                            onclick="examCreateInstance.showModal()"
                            class="btn btn-accent h-full row-span-2"
                        >{{ $t('instanceMeet') }}</button>
                        <dialog
                            id="examCreateInstance"
                            class="modal modal-bottom sm:modal-middle"
                        >
                            <div class="modal-box">
                                <h3 class="text-lg font-bold">{{ $t('examCreateInstanceModal') }}</h3>
                                <div class="py-4 grid grid-cols-4 gap-1">
                                    <div class="self-center">{{ $t('title') }}</div>
                                    <div class="col-span-3">
                                        <input
                                            type="text"
                                            class="input input-sm w-full bg-white"
                                            v-model="instanceMeet"
                                        />
                                    </div>
                                </div>
                                <div class="modal-action">
                                    <form method="dialog">
                                        <a 
                                            target="_blank"
                                            :href="sanitizeUrl(`${config.public.meeting}/${instanceMeet}`)"
                                            class="btn btn-primary mx-3"
                                        >{{ $t('createMeet') }}</a>
                                        <button class="btn">{{$t('close')}}</button>
                                    </form>
                                </div>
                            </div>
                        </dialog>
                        <CreateExamSession :user="user" />
                        <CreateMeetingSession :user="user" />
                    </div>
                </div></div>
            </div>
            <div class="col-span-2 order-2 lg:order-3 card bg-white">
                <div class="card-body grid grid-cols-4 h-full gap-3">
                    <div class="col-span-1 row-span-1">
                        <img alt="user profile"  src="/assets/images/user.png" />
                    </div>
                    <div class="col-span-3 text-2xl flex">
                        <span class="ml-3">
                            {{ $t('welcome') }}
                            <br />
                            {{ props.user.display }}
                            <br />
                            <span class="text-xs capitalize">{{ props.user.roles?.join(', ') }}</span>
                        </span>
                    </div>
                    <div class="col-span-1 flex justify-center">
                        <button
                            onclick="notifinationModal.showModal()"
                            :class="noti.length > 0
                                ? `badge badge-lg bg-red-200 hover:bg-error hover:text-white transition border-error text-error`
                                : `badge badge-lg`
                                "
                        >
                            <Icon
                                name="solar:bell-linear"
                                size="1.2em"
                                class="mr-2"
                            ></Icon>
                            <span>{{ noti.length }}</span>
                        </button>
                    </div>
                    <div class="col-span-3 flex justify-end">
                        <button
                            class="btn btn-error btn-outline btn-xs"
                            @click="logout"
                        >
                            {{ $t('logout') }}
                        </button>
                    </div>
                </div>
            </div>
        </div>
        <div class="gap-5 col-span-2 lg:col-span-4">
            <div
                class="hidden lg:block"
                v-if="!isLoading"
                style="height: 514px"
            >
                <VDatePicker
                    class="h-96"
                    :attributes="attributes"
                    title-position="left"
                    v-model="date"
                    @click="filterMeet"
                    expanded
                ></VDatePicker>
            </div>
        </div>
        <div
            class="col-span-2"
            v-if="!isLoading"
        >
            <label class="input transition flex items-center gap-2 bg-white">
                <Icon name="solar:minimalistic-magnifer-linear" />
                <input
                    type="text"
                    class="grow"
                    placeholder="search"
                    @keyup="filterMeet"
                    ref="searchText"
                />
            </label>

            <div
                class="overflow-y-visible lg:overflow-y-scroll"
                style="height: 514px"
            >
                <a
                    v-for="meet of filteredMeets"
                    :class="`card bg-white my-1 transition border-2 ${meet.patientId ? `border-primary hover:bg-primary hover:text-white` : 'border-secondary hover:bg-secondary'}`"
                    :href="sanitizeUrl(meet.patientId ? `/exam/${meet.id}` : `/meet/${meet.id}`)"
                >
                    <div class="card-body">
                        <span class="text-xl font-bold">{{ meet.title }}</span>
                        <span>{{ meet.description }}</span>
                        <hr />
                        <div class="grid grid-cols-2">
                            <div class="flex">
                                <Icon
                                    name="solar:calendar-outline"
                                    size="1.3em"
                                    class="mx-1"
                                />
                                <span class="text-sm">{{
                                    moment(meet.starttime).format('MMMM Do YYYY')
                                }}</span>
                            </div>
                            <div class="flex">
                                <Icon
                                    name="solar:clock-circle-linear"
                                    size="1.3em"
                                    class="mx-1"
                                />
                                <span class="text-sm">{{ moment(meet.starttime).format('HH:mm') }} -
                                    {{ moment(meet.endtime).format('HH:mm') }}</span>
                            </div>
                        </div>
                    </div>
                </a>
            </div>
        </div>
        <dialog
            id="notifinationModal"
            class="modal modal-bottom sm:modal-middle"
        >
            <div class="modal-box bg-base-600">
                <h3 class="text-lg font-bold py-3">{{ $t('notificationModal') }}</h3>
                <div class="flex flex-col mt-2 gap-2">
                    <div
                        class="card bg-white p-4 grid grid-cols-4"
                        v-for="n of noti"
                    >
                        <span class="font-bold col-span-3">{{ n.by }}</span>
                        <a
                            v-if="n.link"
                            :href="sanitizeUrl(n.link)"
                            class="btn btn-accent text-white row-span-2 self-center"
                        >{{ $t('link') }}</a>
                        <p class="col-span-3">{{ n.message }}</p>
                    </div>
                </div>
                <div class="modal-action">
                    <form method="dialog">
                        <button class="btn">{{$t('close')}}</button>
                    </form>
                </div>
            </div>
        </dialog>
    </div>
</template>

<style lang="css">
.vc-pane-layout {
    height: 556px;
}

.vc-week {
    height: 72px !important;
}

.vc-dots {
    margin-bottom: 15px;
}
</style>
