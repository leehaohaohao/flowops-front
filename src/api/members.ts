import request from '@/utils/request'
import type { ApiResponse, GroupMember } from '@/types'

export function getProjectMembers(projectId: number): Promise<ApiResponse<GroupMember[]>> {
  return request.get(`/api/projects/${projectId}/members`)
}

export function addMember(projectId: number, data: { userId: number; roleId: number }): Promise<ApiResponse<null>> {
  return request.post(`/api/projects/${projectId}/members`, data)
}

export function updateMemberRole(projectId: number, userId: number, data: { roleId: number }): Promise<ApiResponse<null>> {
  return request.put(`/api/projects/${projectId}/members/${userId}`, data)
}

export function removeMember(projectId: number, userId: number): Promise<ApiResponse<null>> {
  return request.delete(`/api/projects/${projectId}/members/${userId}`)
}
