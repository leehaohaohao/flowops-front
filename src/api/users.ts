import request from '@/utils/request'
import type { ApiResponse, SysUser } from '@/types'

export function getUserList(): Promise<ApiResponse<SysUser[]>> {
  return request.get('/api/users/list')
}

export function createUser(data: {
  username: string
  password: string
  projectId?: number
  roleId: number
  extraPermissions?: string[]
}): Promise<ApiResponse<null>> {
  return request.post('/api/users/create', data)
}

export function deleteUser(id: number): Promise<ApiResponse<null>> {
  return request.delete(`/api/users/${id}`)
}
