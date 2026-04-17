<script setup lang="js">
import LoadingScreen from './components/LoadingScreen.vue'
import LoginForm from './components/LoginForm.vue';

const config = useRuntimeConfig()
const route = useRoute()

const isReady = ref(false)
const isLogin = ref(false)
const user = ref({})

setTimeout(() => {
  isReady.value = true
}, 200);

async function setLogin (e) {
  const result = await fetch(`${config.public.apiBase}/api/auth`, {
    method: 'post',
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(e)
  })
    .then(r => r.json())
    .catch(e => console.error(e))

  user.value = { ...result.user, roles: result.user.roleMaps.map(r => r.roleName) }
  sessionStorage.setItem('session-token', result.token)
  sessionStorage.setItem('session-user', JSON.stringify({ ...result.user, roles: result.user.roleMaps.map(r => r.roleName) }))
  isLogin.value = true
}

async function checkProviderID () {
  console.log(route.query)
  const code = route.query.code
  if (code) {
    

    const result = await fetch(`${config.public.apiBase}/api/auth/providerID`, {
      method: 'post',
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        code:code
      })
    })
      .then(r => r.json())
      .catch(e => console.error(e))

    console.log(result.data)
    if (result.data) {
      // nuxt.$setProviderIDToken(result.data.providerID.access_token)
      console.log('Provider ID login successful')
      user.value = { ...result.data.user, roles: ['admin', 'staff'] }
      sessionStorage.setItem('session-token', result.data.token)
      sessionStorage.setItem('session-user', JSON.stringify({ ...result.data.user, roles: ['admin', 'staff'] }))
      sessionStorage.setItem('session-provider-access', result.data.providerID.access_token)

      if(result.data?.providerIDProfile?.organization) {
        sessionStorage.setItem('session-organization', JSON.stringify(result.data.providerIDProfile.organization))
      } else {
        sessionStorage.removeItem('session-organization')
      }
      isLogin.value = true
      window.history.replaceState(null, '', window.location.pathname)
    }
    // console.log('provider id token',nuxt.$getProviderIDToken())

  }
}

onMounted(async () => {
  try {
    await checkProviderID()
    const sessionToken = sessionStorage.getItem('session-token')
    const sessionUser = sessionStorage.getItem('session-user')
    if (sessionToken && sessionUser) {
      user.value = JSON.parse(sessionUser)
      isLogin.value = true
    }
  } catch (error) {
    console.error('Error during onMounted:', error)
    isLogin.value = false
  }
},)

</script>

<template>
  <div>
    <!-- {{ isLogin }} -->
    <div v-if="!isReady">
      <LoadingScreen></LoadingScreen>
    </div>
    <div v-else-if="isLogin">
      <NuxtLayout :user="user">
        <NuxtPage :user="user"></NuxtPage>
      </NuxtLayout>
    </div>
    <div v-else>
      <LoginForm @userLogin="setLogin"></LoginForm>
    </div>
  </div>
</template>
