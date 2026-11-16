import http from '@/axios/index.js';

export function loginUserInfo(accountId) {
    return http.get('/my/loginUserInfo', {params: {accountId}})
}

export function resetPassword(password) {
    return http.put('/my/resetPassword', {password})
}

export function userDelete() {
    return http.delete('/my/delete')
}

