<script setup>
import { getData } from '~/functions/getData';

const stat = ref({})
onMounted(async () => {
    stat.value = await getData('/api/stat', {})
})
</script>

<template>
    <div class="">
        <div class="card bg-white grid grid-cols-2 lg:grid-cols-4 my-2">
            <div class="py-5 text-center">
                <span class="text-xl">ผู้เข้าใช้งานวันนี้ ผ่านเว็บไซต์</span><br />
                <span class="text-3xl">{{ stat.webCount?.login || 0 }}</span>
            </div>
            <div class="py-5 text-center">
                <span class="text-xl">ผู้เข้าใช้งานวันนี้ ผ่านมือถือ</span><br />
                <span class="text-3xl">{{ stat.mobileCount?.login || 0 }}</span>
            </div>
            <div class="py-5 text-center">
                <span class="text-xl">ผู้เข้าใช้ห้องตรวจวันนี้ / ทั้งหมด</span><br />
                <span class="text-3xl">{{ stat.webCount?.exam || 0 }} / {{stat.exams?.length}}</span>
            </div>
            <div class="py-5 text-center">
                <span class="text-xl">ผู้เข้าใช้ห้องประชุมวันนี้ / ทั้งหมด</span><br />
                <span class="text-3xl">{{ stat.webCount?.meet || 0 }} / {{stat.meetings?.length}}</span>
            </div>
        </div>
        <div class="card bg-white my-2">
            <div class="py-5 text-center">
                <span class="text-xl">การใช้งานตามหน่วยงาน</span>
            </div>
            <div class="overflow-x-auto">
                <table class="table">
                    <!-- head -->
                    <thead>
                    <tr>
                        <th></th>
                        <th>หน่วยงาน</th>
                        <th>เข้าใช้งานจากมือถือ</th>
                        <th>เข้าใช้งานจากเว็บไซต์</th>
                        <th>ห้องตรวจ</th>
                        <th>ห้องประชุม</th>
                        <th>ระยะเวลาการใช้งาน</th>
                    </tr>
                    </thead>
                    <tbody>
                        <tr>
                            <td colspan="6" class="text-center">ยังไม่มีข้อมูลในขณะนี้</td>
                        </tr>
                    </tbody>
                </table>
            </div>
        </div>
    </div>
</template>