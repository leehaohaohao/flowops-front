export interface ApiResponse<T> {
  code: number
  msg: string
  data: T
}

export interface LoginRequest {
  username: string
  password: string
}

export interface UserGroup {
  id: number
  name: string
  roleName: string
  isSupervisor: boolean
}

export interface UserInfo {
  username: string
  isSuperAdmin: boolean
  groups: UserGroup[]
  projectPermissions?: Record<string, string[]>
}

export interface DashboardStats {
  totalServices: number
  runningServices: number
  totalDeploys: number
}

export interface SysUser {
  id: number
  username: string
  role: string
  createTime: string
}

export interface Project {
  id: number
  groupId: number
  name: string
  description: string
  createTime: string
  updateTime: string
}

export interface DeployService {
  id: number
  name: string
  projectId: number
  projectName: string
  port: number
  volumeDir: string
  serviceType: 'backend' | 'frontend' | 'fullstack'
  serviceConfig: string
  status: 'running' | 'stopped'
  createTime: string
  updateTime: string
}
