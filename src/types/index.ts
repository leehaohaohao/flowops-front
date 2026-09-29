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
  nodeId?: string
  networkId?: number | null
  volumeDir: string
  serviceType: 'backend' | 'frontend' | 'fullstack'
  serviceConfig: string
  portMappings?: string
  status: 'running' | 'stopped'
  createTime: string
  updateTime: string
}

export interface NodeInfo {
  runnerId: string
  hostname: string
  ip: string
  version: string
  lastHeartbeatTime: number
  online: boolean
  runningTasks: number
  cpuUsage: number
  memoryUsage: number
}

export interface RegisteredNode {
  runnerId: string
  nodeName: string
  status: string
  lastHeartbeat: string
  createTime: string
  hasToken: boolean
}

/** 主节点已登记网络（超级管理员视图） */
export interface NetworkInfo {
  id: number
  name: string
  displayName: string
  /** MANAGED / IMPORTED */
  source: string
  /** PRESENT / MISSING（主节点 Docker 实际状态） */
  dockerStatus: string
  grantedProjectCount: number
  serviceRefCount: number
  createTime: string
}

/** 可导入的主节点 Docker 网络（未登记的用户自定义 bridge） */
export interface ImportableNetwork {
  name: string
  driver: string
}

/** 项目可选网络（已授权且主节点 Docker 实际存在） */
export interface ProjectNetwork {
  id: number
  name: string
  displayName: string
  source: string
  dockerStatus: string
}

/** 一次 SSH 连接测试的结果（POST .../ssh/test 的 data，也是 GET 响应中的 lastTest） */
export interface SshTestResult {
  /** 结果码；接口成功不代表连接成功，需按码映射中文原因 */
  resultCode: string
  message: string
  testedAt: string
  durationMs: number
}

/** 主机密钥算法（H1.2 契约：ED25519 / ECDSA / RSA，服务端归一化为大写） */
export type SshHostKeyAlgorithm = 'ED25519' | 'ECDSA' | 'RSA'

/** 节点宿主机的 SSH 目标设置（脱敏：不含私钥内容与主节点绝对路径） */
export interface SshTarget {
  runnerId: string
  host: string
  port: number
  username: string
  /** 私钥别名，对应主节点容器内 key-dir/<keyAlias> */
  keyAlias: string
  /** 归一化后的远端主机密钥指纹 */
  hostKeySha256: string
  /** 与指纹配对的主机密钥算法；H1 之前的旧记录为 null，补齐前禁止测试 */
  hostKeyAlgorithm: string | null
  /** 主节点内该别名私钥是否存在且为普通文件（不返回路径） */
  keyFileExists: boolean
  /** 最近一次测试结果；从未测试或设置被覆盖后为 null */
  lastTest: SshTestResult | null
  updateTime: string
}

/** 主节点已存储的执行器发布包（P4 只展示，不解析包内容） */
export interface RunnerPackage {
  /** 包摘要（小写十六进制 64 位），不可变标识 */
  sha256: string
  fileName: string
  version: string
  os: string
  arch: string
  sizeBytes: number
  gitCommit: string
  imageReference: string
  imageId: string
  dockerCliVersion: string
  composeVersion: string
  formatVersion: number
  uploadedBy: string
  uploadedAt: string
  /** 仅上传响应出现：true 表示索引行此前已存在 */
  existing?: boolean
  /** 仅上传响应出现：true 表示本次重写了主节点磁盘上的包文件（按摘要修复） */
  repaired?: boolean
}

/** 一次发布包分发记录（异步状态机） */
export interface PackageDistribution {
  id: number
  runnerId: string
  packageSha256: string
  version: string
  fileName: string
  sizeBytes: number
  /** PENDING / UPLOADING / VERIFYING / SUCCEEDED / FAILED */
  status: string
  /** 目标机已有同摘要包而跳过传输即成功 */
  alreadyPresent: boolean
  /** 失败机器码；成功为 null */
  errorCode: string | null
  /** 失败中文说明，可直接展示 */
  errorMessage: string | null
  /** 目标机正式包路径（固定、非敏感） */
  remotePath: string | null
  /** 本次分发绑定的、已通过连接测试的 SSH 配置版本；null = 未绑定（旧记录，必然失败为 SSH_CONFIG_CHANGED） */
  sshConfigVersion: number | null
  operator: string
  startedAt: string | null
  finishedAt: string | null
  durationMs: number | null
}
