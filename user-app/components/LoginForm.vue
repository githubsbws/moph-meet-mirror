<script setup lang="js">
const emit = defineEmits('userLogin')

// const redirectURI = 'https://live-meet.dasiens.com/'
const redirectURI = 'http://localhost:3000/'
const loginData = ref({ username: '', password: '' })
const healthIDProviderID = {
    providerID: {
        clientID: '01953bd5-fc1e-73d4-9142-7598d70c34dc'
    }
}
async function login() {
    emit('userLogin', loginData.value)
}
</script>

<template>
    <div class="flex flex-col justify-center">
        <div class="flex flex-col justify-center py-3"> 
            <img alt="MOPH meet logo" src="/assets/images/logo.png" class="h-36 my-5 mx-auto"/>
        </div>
        <div class="container p-5 mx-auto max-w-sm">
            <div class="card bg-white p-5">
                <div class="text-center text-2xl mt-2 text-bold"> {{$t('Login')}} </div>
                <label class="form-control w-full max-w-xs mx-auto">
                    <div class="label">
                        <span class="label-text">{{$t('Username')}}</span>
                    </div>
                    <input type="text" :placeholder="$t('UsernamePlaceholder')" class="input input-bordered w-full max-w-xs" @keyup="(ev) => (loginData.username = ev.target.value)" />
                    <div class="label">
                    </div>
                </label>
                <label class="form-control w-full max-w-xs mx-auto">
                    <div class="label">
                        <span class="label-text">{{$t('Password')}}</span>
                    </div>
                    <input type="password" :placeholder="$t('PasswordPlaceholder')" class="input input-bordered w-full max-w-xs" @keyup="(ev) => (loginData.password = ev.target.value)" />
                    <div class="label">
                    </div>
                </label>
                <div class="w-full max-w-xs mx-auto py-3">
                    <button @click.stop="login()" class="btn btn-primary w-full">{{$t('loginButton')}}</button>
                </div>
                <hr />
                <div class="w-full max-w-xs mx-auto py-3">
                    <button class="btn w-full">{{$t('ThaiDButton')}}</button>
                </div>
                <div class="w-full max-w-xs mx-auto py-3">
                    <a class="btn w-full" :href="`https://moph.id.th/oauth/redirect?client_id=${healthIDProviderID.providerID.clientID}&redirect_uri=${redirectURI}&response_type=code`">{{$t('ProviderIDButton')}}</a>
                </div>
            </div>
        </div>
    </div>
</template>
