<script setup lang="js">
import { linkDevice, scanDevice } from '~/functions/activeDevice';
const props = defineProps({
    patientID: String
})

const devices = ref([])

const iconCases = {
    bluetooth: 'solar:bluetooth-square-outline',
    serial: 'solar:plug-circle-bold',
    usb: 'solar:usb-outline',
    network: 'solar:wi-fi-router-bold'
}

const activeDevices = ref([])

async function connectDevice (dev,key) {
    deviceManagement.close()
    delete devices.value[key]
    const device = ref({ ...dev, values:{} })
    activeDevices.value.push(device)
    linkDevice(device, props.patientID)
}

async function disconnectDevice (dev,key) {
    deviceManagement.close()
    delete activeDevices.value[key]
    devices.value.push(dev.value)
}

onMounted(async () => {
    devices.value = await scanDevice()
})

</script>

<template>
    <div>
        <div class="container mx-auto  text-2xl my-3"
            ><span>{{ $t('medicalDevices') }}</span
            ><button
                class="mx-3 hover:text-primary transition pt-2"
                onclick="deviceManagement.showModal()"
            >
                <Icon name="solar:add-square-outline" size="1em" /> </button
        ></div>
        <div class="container mx-auto lg:grid lg:grid-cols-2 xl:grid-cols-3 gap-2 content-center">
            <div v-for="[key, dev] of Object.entries(activeDevices)" :class="dev.value.img ? 'col-span-3': ''" class="py-2">
                <div
                    class="card p-5 shadow bg-primary text-white my-auto"
                    :class="dev.value.img ? 'md:grid grid-cols-3': ''"
                    
                >
                    <div class="grid grid-cols-3">
                        <div class="col-span-2 text-xl">
                            {{ dev.value.name }}
                        </div>
                        <div class="text-right">
                            <Icon
                                :name="iconCases[dev.value.connector] || 'solar:socket-outline'"
                                size="2em"
                            />
                        </div>
                        <div class="col-span-3"v-for="[key, value] of Object.entries(dev.value.values)">
                            <div class="col-span-3">
                                {{ key }}
                            </div>
                            <div class="col-span-3 text-3xl text-center">
                                {{ value }}
                            </div>
                        </div>
                        <div class="col-span-3 text-3xl text-center" v-if="Object.values(dev.value.values).length <=0">
                            <Icon name="svg-spinners:3-dots-fade" />
                        </div>
                        <div class="col-span-2">
                            <span class="text-xs">{{ dev.value.id }}</span>
                        </div>
                        <div class="col-span-1 flex justify-end">
                            <button
                                class="btn btn-xs text-error hover:text-white hover:bg-error p-1"
                                @click="disconnectDevice(dev, key)"
                            >
                                <Icon name="solar:trash-bin-minimalistic-outline" size="1.2em" />
                            </button>
                        </div>
                    </div>
                    <div v-if="dev.value.img" class="col-span-2 py-2 md:px-2">
                        <img :src="dev.value.img" class="mx-auto">
                    </div>
                </div>
            </div>
        </div>
        <dialog id="deviceManagement" class="modal modal-bottom sm:modal-middle">
            <div class="modal-box">
                <h3 class="text-lg font-bold">{{ $t('medDeviceAdding') }}</h3>
                <div class="grid grid-cols-2 gap-1">
                    <div
                        class="card grid grid-cols-2 bg-white shadow-sm scale-95 hover:bg-accent hover:text-base-100 hover:scale-100 hover:shadow-lg transition cursor-pointer p-3"
                        v-for="[key, dev] of Object.entries(devices)"
                        @click="connectDevice(dev, key)"
                    >
                        <span class="col-span-2 text-2xl">{{ dev.name }}</span>
                        <span class="col-span-2 text-lg">{{ $t(dev.type) }}</span>
                        <span class="col-span-2">{{ dev.organize }}</span>
                        <span class="text-xs">{{ dev.id }}</span>
                        <div class="text-right">
                            <span class="hidden lg:inline">{{ dev.connector }} <br /></span>
                            <span>
                                <Icon
                                    :name="iconCases[dev.connector] || 'solar:socket-outline'"
                                    size="2em"
                                />
                            </span>
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
</template>
