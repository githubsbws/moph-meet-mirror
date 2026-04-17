export async function getData (path: string, opt: RequestInit) {
    const config = useRuntimeConfig()

    opt.headers = {
        ...opt.headers,
        "Content-Type": "application/json",
        "Authorization": `Bearer ${sessionStorage.getItem('session-token')}`
    }
    const data = await fetch(`${config.public.apiBase}${path}`, {
        ...opt,
    }).then(res => res.json())
    if (data.message) {
        console.error(data.message)
        sessionStorage.clear()
        window.location.href = '/'
    }
    return data
}