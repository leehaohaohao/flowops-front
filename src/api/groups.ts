import request from '@/utils/request'
import type { ApiResponse } from '@/types'

export interface Group {
  id: number
  name: string
  description: string
  isDefault?: number
  memberCount?: number
  projectCount?: number
  createTime: string
}

export function getGroupList(): Promise<ApiResponse<Group[]>> {
  return request.get('/api/groups')
}

export function getGroup(id: number): Promise<ApiResponse<Group>> {
  return request.get(`/api/groups/${id}`)
}

export function createGroup(data: { name: string; description?: string }): Promise<ApiResponse<null>> {
  return request.post('/api/groups', data)
}

export function updateGroup(id: number, data: { name: string; description?: string }): Promise<ApiResponse<null>> {
  return request.put(`/api/groups/${id}`, data)
}

export function deleteGroup(id: number): Promise<ApiResponse<null>> {
  return request.delete(`/api/groups/${id}`)
}
