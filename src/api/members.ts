import request from '@/utils/request'
import type { ApiResponse, GroupMember } from '@/types'

export function getGroupMembers(groupId: number): Promise<ApiResponse<GroupMember[]>> {
  return request.get(`/api/groups/${groupId}/members`)
}

export function addMember(groupId: number, data: { userId: number; roleId: number }): Promise<ApiResponse<null>> {
  return request.post(`/api/groups/${groupId}/members`, data)
}

export function updateMemberRole(groupId: number, userId: number, data: { roleId: number }): Promise<ApiResponse<null>> {
  return request.put(`/api/groups/${groupId}/members/${userId}`, data)
}

export function removeMember(groupId: number, userId: number): Promise<ApiResponse<null>> {
  return request.delete(`/api/groups/${groupId}/members/${userId}`)
}
