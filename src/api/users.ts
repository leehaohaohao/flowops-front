import request from '@/utils/request'
import type { ApiResponse, SysUser } from '@/types'

export function getUserList(): Promise<ApiResponse<SysUser[]>> {
  return request.get('/api/users/list')
}

export function createUser(data: {
  username: string
  password: string
  projects?: Array<{ projectId: number; roleId: number; extraPermissions?: string[] }>
}): Promise<ApiResponse<null>> {
  return request.post('/api/users/create', data)
}

export function updateUser(id: number, data: {
  projects?: Array<{ projectId: number; roleId: number; extraPermissions?: string[] }>
}): Promise<ApiResponse<null>> {
  return request.put(`/api/users/${id}`, data)
}

export interface AssignableData {
  roles: Array<{ id: number; name: string; description: string; permissions: string[] }>
  permissions: string[]
}

export function getAssignable(projectId?: number): Promise<ApiResponse<AssignableData>> {
  return request.get('/api/users/assignable', { params: projectId ? { projectId } : undefined })
}

export function deleteUser(id: number): Promise<ApiResponse<null>> {
  return request.delete(`/api/users/${id}`)
}
