import request from '@/utils/request'
import type { ApiResponse, LoginRequest, UserInfo } from '@/types'

export function login(data: LoginRequest): Promise<ApiResponse<string>> {
  return request.post('/auth/login', data)
}

export function logout(): Promise<ApiResponse<null>> {
  return request.post('/auth/logout')
}

export function getUserInfo(): Promise<ApiResponse<UserInfo>> {
  return request.get('/auth/info')
}
