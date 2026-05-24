import request from '@/utils/request'
import type { ApiResponse, Role } from '@/types'

export function getPresetRoles(): Promise<ApiResponse<Role[]>> {
  return request.get('/api/roles/presets')
}

export function getProjectRoles(projectId: number): Promise<ApiResponse<Role[]>> {
  return request.get('/api/roles', { params: { projectId } })
}

export function getRolePermissions(roleId: number): Promise<ApiResponse<string[]>> {
  return request.get(`/api/roles/${roleId}/permissions`)
}

export function createRole(data: {
  name: string
  projectId: number
  description?: string
  permissions: string[]
}): Promise<ApiResponse<null>> {
  return request.post('/api/roles', data)
}

export function updateRole(id: number, data: {
  name?: string
  description?: string
  permissions?: string[]
}): Promise<ApiResponse<null>> {
  return request.put(`/api/roles/${id}`, data)
}

export function deleteRole(id: number): Promise<ApiResponse<null>> {
  return request.delete(`/api/roles/${id}`)
}
