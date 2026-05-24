import request from '@/utils/request'
import type { ApiResponse, Project } from '@/types'

export function getProjectList(groupId?: number): Promise<ApiResponse<Project[]>> {
  return request.get('/api/projects', { params: groupId ? { groupId } : undefined })
}

export function getProject(id: number): Promise<ApiResponse<Project>> {
  return request.get(`/api/projects/${id}`)
}

export function createProject(data: { groupId: number; name: string; description?: string }): Promise<ApiResponse<null>> {
  return request.post('/api/projects', data)
}

export function updateProject(id: number, data: { name: string; description?: string }): Promise<ApiResponse<null>> {
  return request.put(`/api/projects/${id}`, data)
}

export function deleteProject(id: number): Promise<ApiResponse<null>> {
  return request.delete(`/api/projects/${id}`)
}
