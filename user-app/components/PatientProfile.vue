<script setup>
const cid = ref('1310100004208')
const otp = ref('')
const result = ref(null)
const organization = ref(null)
const organizationList = ref([])
function requestOTP () {
    fetch('https://phr1.moph.go.th/api/RequestTokenv1', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            "Authorization": `Bearer ${organization.value?.moph_access_token_idp}`
        },
        body: JSON.stringify({
            cid: cid.value,
        })
    })
}
async function loadData () {
    await fetch('https://phr1.moph.go.th/api/WebApp?Action=ValidateOTP', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            "Authorization": `Bearer ${organization.value?.moph_access_token_idp}`
        },
        body: JSON.stringify({
            cid: cid.value,
            otp: otp.value
        })
    })
        .then(res => res.json())
        .catch(err => console.error(err))

    result.value = await fetch('https://phr1.moph.go.th/api/WebApp?Action=Encounter', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            "Authorization": `Bearer ${organization.value?.moph_access_token_idp}`
        },
        body: JSON.stringify({
            cid: cid.value,
            otp: otp.value
        })
    })
        .then(res => res.json())
        .catch(err => console.error(err))
    
    // fetch(`https://phr1.moph.go.th/api/WebApp?Action=Encounter&cid=${cid.value}`, {
    //     method: 'GET',
    //     headers: {
    //         'Content-Type': 'application/json',
    //         "Authorization": `Bearer ${sessionStorage.getItem('session-provider-access')}`
    //     }
    // })
    //   .then(response => response.json())
    //   .then(data => {
    //     // Handle the patient profile data
    //       console.log(data);
    //     result.value = data;
    //   })
    //   .catch(error => {
    //     console.error('Error fetching patient profile:', error);
    //   });
}

onMounted(() => {
    organizationList.value = JSON.parse(sessionStorage.getItem('session-organization')) || []
    if (organizationList.value.length > 0) {
        organization.value = organizationList.value[0]
    } else {
        organization.value = null
    }
})

</script>
<template>
    <div>
        <!-- {{ organization?.moph_access_token_idp }} -->
          <div class="card shadow my-5 bg-white">
            <div class="card-body">
                <div class="my-2">
                    <input type="text" v-model="cid" placeholder="Enter CID" class="input input-bordered w-full  mb-3" />
                    <button @click="requestOTP" class="btn btn-primary mb-3">Get OTP</button>
                </div>
                <div class="my-2">
                    <input type="text" v-model="otp" placeholder="Enter OTP" class="input input-bordered w-full  mb-3" />
                    <button @click="loadData" class="btn btn-primary mb-3">Read profile</button>
                </div>
            </div>
          </div>

        <div v-if="result && result.result.length > 0" class="flex flex-col">
            <div class="card shadow my-5 bg-white" v-for="(row, index) in result.result.reverse()" :key="index">
                <div class="card-body">
                    <!-- {{ row }} -->
                    หน่วยงาน {{ row.organization_name }} <br />
                    วันที่ {{ row.period_start.replace('T', ' ') }} ถึง {{ row.period_end.replace('T', ' ') }} <br />
                    <br />
                    {{ row.encounter_cc_text }}<br />
                    {{ row.encounter_diagnosis_icd }}<br />
                    {{ row.encounter_medication_text }}<br />
                    <br />
                    น้ำหนัก {{ row.vital_sign_body_weight_kg || '-' }} กก<br />
                    ส่วนสูง {{ row.vital_sign_body_height_cm || '-' }} ซม<br />
                    อุณหภูมิ {{ row.vital_sign_body_temp_cel || '-' }} °C<br />
                    ความดันโลหิต {{ row.vital_sign_bp_systolic_mmhg || '-' }} / {{ row.vital_sign_bp_diastolic_mmhg || '-' }} มมHg
                </div>
            </div>
        </div>
        <div v-else class="card shadow my-5 bg-base-100">
            <div class="card-body">
                Not found
            </div>
        </div>
    </div>
</template>