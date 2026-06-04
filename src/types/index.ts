export interface ApiResponse<T> {
  code: number
  msg: string
  data: T
}

export interface LoginRequest {
  username: string
  password: string
}

export interface UserProject {
  id: number
  name: string
  roleName: string
}

export interface UserInfo {
  username: string
  superAdmin: boolean
  projects: UserProject[]
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
  isSuperAdmin: boolean | number
  projects: Array<{ id: number; name: string; roleName: string }>
  createTime: string
}

export interface Project {
  id: number
  name: string
  description: string
  isDefault?: number
  memberCount?: number
  serviceCount?: number
  runningCount?: number
  createTime: string
  updateTime?: string
}

export interface GroupMember {
  userId: number
  username: string
  roleId: number
  roleName: string
  joinTime: string
}

export interface Role {
  id: number
  name: string
  description: string
  isPreset: boolean
  projectId?: number
}

export interface CrossAccess {
  id: number
  userId: number
  projectId: number
  permCode: string
  createTime: string
}

export interface AggregatedAccess {
  userId: number
  projectId: number
  items: Array<{ id: number; permCode: string; createTime: string }>
}

export interface LogFileInfo {
  filename: string
  size: number
  lastModified: string
}

export interface PortMapping {
  hostPort?: number
  containerPort: number
  protocol?: string
  label?: string
  primary?: boolean
  expose?: boolean
  target?: string
}

export interface DeployService {
  id: number
  name: string
  deployName: string
  remark?: string
  projectId: number
  projectName: string
  port: number
  volumeDir: string
  serviceType: 'backend' | 'frontend' | 'fullstack'
  serviceConfig: string
  portMappings?: string
  extraPorts?: string
  status: 'running' | 'stopped'
  createTime: string
  updateTime: string
}
