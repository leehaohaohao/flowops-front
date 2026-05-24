# FlowOps 前端权限系统 — 设计与对接文档

## 一、整体架构

### 1.1 权限模型

```
超级管理员 (isSuperAdmin)
  ├── 全部权限，无需 projectPermissions
  ├── 可管理：项目组、用户、跨组授权
  └── 菜单可见：仪表盘、服务管理、日志查看、项目组管理、用户管理、跨组授权、角色管理

主管 (isSupervisor = true，属于某个项目组)
  ├── 通过 projectPermissions 判断项目级权限
  ├── 可管理：组内成员、项目、角色
  └── 菜单可见：仪表盘、服务管理、日志查看、角色管理

普通成员
  ├── 通过 projectPermissions 判断项目级权限
  └── 菜单可见：仪表盘、服务管理、日志查看
```

### 1.2 数据流

```
用户登录
  │
  ▼
POST /auth/login → JWT Token → localStorage
  │
  ▼
AuthGuard 启动
  │
  ├─ 无 token → 跳转 /login
  │
  └─ 有 token → GET /auth/info
                  │
                  ├─ 成功 → UserInfo 写入 UserContext
                  │         ├─ isSuperAdmin: boolean
                  │         ├─ groups: [{ id, name, roleName, isSupervisor }]
                  │         └─ projectPermissions: { [projectId]: string[] }
                  │
                  └─ 失败 → 清除 token → 跳转 /login
```

---

## 二、认证流程

### 2.1 登录

```
POST /auth/login
Body: { username, password }
Response: { code: 200, data: "<JWT Token>" }
```

前端行为：
1. 调用 `login()` API
2. 成功后 `localStorage.setItem('token', token)`
3. 跳转 `/dashboard`

**文件：** `src/pages/Login.tsx` → `src/api/auth.ts`

### 2.2 请求鉴权

Axios 拦截器统一处理：

```
请求拦截器：
  每个请求自动附加 Header: Authorization: <token>

响应拦截器：
  code === 401 → 清除 token，跳转 /login
  code === 403 → reject("权限不足")
  code !== 200 → reject(msg)
  code === 200 → 返回 response.data
```

**文件：** `src/utils/request.ts`

### 2.3 应用入口鉴权

`AuthGuard` 组件（App.tsx）：
1. 读取 `localStorage.getItem('token')`
2. 无 token → `<Navigate to="/login" />`
3. 有 token → 调用 `getUserInfo()` 获取用户信息
4. 成功 → `UserContext.Provider` 包裹整个应用
5. 失败 → 清除 token → 跳转登录

**问题点：** `AuthGuard` 只在应用首次加载时获取一次 UserInfo。如果用户权限在其他端被修改，当前会话不会自动刷新，需要重新登录。

---

## 三、权限判断机制

### 3.1 核心函数

```typescript
// src/utils/permission.ts

// 判断用户对某个服务是否有指定权限
hasPermission(userInfo, service, permCode) → boolean
  - 超级管理员 → true
  - 查 userInfo.projectPermissions[String(service.projectId)]
  - 包含 permCode → true，否则 false

// 判断用户是否为某组的主管
isSupervisor(userInfo, groupId?) → boolean
  - 超级管理员 → true
  - 无 groupId → 任意组有 isSupervisor 即 true
  - 有 groupId → 该组 isSupervisor 即 true
```

### 3.2 权限码使用位置

| 权限码 | 使用位置 | 控制内容 |
|--------|---------|---------|
| `VIEW` | ServiceList | 日志按钮 |
| `DEPLOY` | ServiceList | 部署、重启按钮 |
| `STOP` | ServiceList | 停止按钮 |
| `UPLOAD` | ServiceList | 上传按钮 |
| `EDIT_CONFIG` | ServiceList | 编辑按钮、创建服务按钮 |
| `DELETE` | ServiceList | 删除按钮 |
| `MANAGE_MEMBERS` | 未使用 | 后端控制，前端仅通过 isSupervisor 判断 |
| `MANAGE_PROJECTS` | 未使用 | 后端控制，前端仅通过 isSupervisor 判断 |

**问题点：** `MANAGE_MEMBERS` 和 `MANAGE_PROJECTS` 是主管专属权限码，但前端没有用它们做判断，而是用 `isSupervisor` 代替。如果后端允许非主管角色拥有这两个权限码，前端会漏判。

---

## 四、页面权限控制

### 4.1 路由级

所有受保护路由在 `AuthGuard` 下，未登录无法访问。但**没有路由级权限校验**——任何登录用户都可以直接访问 `/groups`、`/users`、`/access` 等路径，只是菜单不显示。

**问题点：** 普通成员手动输入 `/#/groups` 可以访问项目组管理页面（虽然可能因后端接口 403 而无法操作，但页面本身会渲染）。

### 4.2 页面级

| 页面 | 前端权限控制 | 后端权限控制 |
|------|-------------|-------------|
| GroupList | 超级管理员才显示编辑/删除按钮和创建按钮 | 后端接口应该校验 isSuperAdmin |
| MemberList | `isSupervisor(userInfo, groupId)` 控制操作列 | 后端校验 MANAGE_MEMBERS |
| RoleList | `isSupervisor(userInfo)` 控制操作列和创建按钮 | 后端校验 |
| CrossAccess | 无前端权限控制，所有登录用户可见 | 后端校验 isSuperAdmin |
| ProjectList | `isSupervisor(userInfo)` 控制编辑/删除/创建 | 后端校验 MANAGE_PROJECTS |
| UserList | 无前端权限控制（仅超级管理员有菜单入口） | 后端校验 |
| ServiceList | `hasPermission` 控制每个操作按钮 | 后端校验对应权限码 |

**问题点：**
1. CrossAccess 页面没有前端权限守卫，任何登录用户输入 `/#/access` 都能看到页面
2. UserList 页面同理，虽然菜单只对 superAdmin 显示，但路由没有守卫
3. RoleList 用 `isSupervisor` 判断，但文档说 MANAGE_MEMBERS 是主管专属，如果一个非主管角色被赋予了 MANAGE_MEMBERS 权限，前端无法正确判断

### 4.3 按钮级

ServiceList 中每个操作按钮都通过 `hasPermission` 判断：

```
编辑     → EDIT_CONFIG
上传     → UPLOAD
日志     → VIEW
部署     → DEPLOY
重启     → DEPLOY
停止     → STOP
删除     → DELETE
创建服务 → EDIT_CONFIG (基于当前项目)
```

---

## 五、动态菜单

### 5.1 构建逻辑

```typescript
// src/layouts/MainLayout.tsx

所有用户：
  - 仪表盘 (/dashboard)
  - 服务管理 (/projects)
  - 日志查看 (/logs)

超级管理员额外：
  - 项目组管理 (/groups)
  - 用户管理 (/users)
  - 跨组授权 (/access)

主管额外（含超级管理员）：
  - 角色管理 (/roles)
```

### 5.2 与后端文档差异

后端文档 11.2 节定义的菜单结构：

| 菜单 | 后端文档 | 前端实现 | 差异 |
|------|---------|---------|------|
| 仪表盘 | 所有人 | 所有人 | 一致 |
| 服务列表 | 所有人 | 所有人（路径 /projects） | 一致 |
| 项目组管理 | superAdmin | superAdmin | 一致 |
| 用户管理 | superAdmin | superAdmin | 一致 |
| 跨组授权 | superAdmin | superAdmin | 一致 |
| 成员管理 | 主管 | **未实现** | 缺失 |
| 项目管理 | 主管 | **未实现** | 缺失 |
| 角色管理 | 后端未提及 | 主管 | 前端多了这个 |

**问题点：**
1. 后端文档说主管应看到"成员管理"和"项目管理"菜单，前端没有为它们建独立菜单入口（成员管理目前只能从项目组列表点进去）
2. 前端多了"角色管理"菜单，后端文档没有单独列出

---

## 六、API 对接详情

### 6.1 认证接口

| 接口 | 方法 | 前端文件 | 状态 |
|------|------|---------|------|
| `/auth/login` | POST | `api/auth.ts` | ✅ |
| `/auth/info` | GET | `api/auth.ts` | ✅ |
| `/auth/logout` | POST | `api/auth.ts` | ✅ |

### 6.2 项目组管理（superAdmin）

| 接口 | 方法 | 前端文件 | 状态 |
|------|------|---------|------|
| `/api/groups` | GET | `api/groups.ts` | ✅ |
| `/api/groups/{id}` | GET | `api/groups.ts` | ✅ |
| `/api/groups` | POST | `api/groups.ts` | ✅ |
| `/api/groups/{id}` | PUT | `api/groups.ts` | ✅ |
| `/api/groups/{id}` | DELETE | `api/groups.ts` | ✅ |

### 6.3 项目管理（superAdmin + 主管）

| 接口 | 方法 | 前端文件 | 状态 |
|------|------|---------|------|
| `/api/projects` | GET | `api/projects.ts` | ✅ |
| `/api/projects/{id}` | GET | `api/projects.ts` | ✅ |
| `/api/projects` | POST | `api/projects.ts` | ✅ |
| `/api/projects/{id}` | PUT | `api/projects.ts` | ✅ |
| `/api/projects/{id}` | DELETE | `api/projects.ts` | ✅ |

### 6.4 成员管理

| 接口 | 方法 | 前端文件 | 状态 |
|------|------|---------|------|
| `/api/groups/{groupId}/members` | GET | `api/members.ts` | ✅ |
| `/api/groups/{groupId}/members` | POST | `api/members.ts` | ✅ |
| `/api/groups/{groupId}/members/{userId}` | PUT | `api/members.ts` | ✅ |
| `/api/groups/{groupId}/members/{userId}` | DELETE | `api/members.ts` | ✅ |

### 6.5 角色管理

| 接口 | 方法 | 前端文件 | 状态 |
|------|------|---------|------|
| `/api/roles/presets` | GET | `api/roles.ts` | ✅ |
| `/api/roles?groupId={id}` | GET | `api/roles.ts` | ✅ |
| `/api/roles/{id}/permissions` | GET | `api/roles.ts` | ✅ |
| `/api/roles` | POST | `api/roles.ts` | ✅ |
| `/api/roles/{id}` | PUT | `api/roles.ts` | ✅ |
| `/api/roles/{id}` | DELETE | `api/roles.ts` | ✅ |

### 6.6 跨组授权（superAdmin）

| 接口 | 方法 | 前端文件 | 状态 |
|------|------|---------|------|
| `/api/access/grant` | POST | `api/access.ts` | ✅ |
| `/api/access?userId={id}` | GET | `api/access.ts` | ✅ |
| `/api/access/{id}` | DELETE | `api/access.ts` | ✅ |

### 6.7 用户管理（superAdmin）

| 接口 | 方法 | 前端文件 | 状态 |
|------|------|---------|------|
| `/api/users/list` | GET | `api/users.ts` | ✅ |
| `/api/users/create` | POST | `api/users.ts` | ⚠️ 缺字段 |
| `/api/users/{id}` | DELETE | `api/users.ts` | ✅ |

**问题点：** 后端文档 9.2 节要求创建用户时传 `groupId`、`roleId`、`extraPermissions`，但前端 `createUser` 只传了 `username`、`password`、`role`（字符串），字段不匹配。

### 6.8 服务管理

| 接口 | 方法 | 前端文件 | 状态 |
|------|------|---------|------|
| `/api/services/list` | GET | `api/services.ts` | ✅ |
| `/api/services/{id}` | GET | `api/services.ts` | ✅ |
| `/api/services/create` | POST | `api/services.ts` | ✅ |
| `/api/services/{id}` | PUT | `api/services.ts` | ✅ |
| `/api/services/{id}` | DELETE | `api/services.ts` | ✅ |
| `/api/deploy/start/{id}` | POST | `api/services.ts` | ✅ |
| `/api/deploy/stop/{id}` | POST | `api/services.ts` | ✅ |
| `/api/deploy/restart/{id}` | POST | `api/services.ts` | ✅ |
| `/api/deploy/remove/{id}` | POST | `api/services.ts` | ✅ |
| `/api/deploy/upload/{id}` | POST | `api/services.ts` | ✅ |
| `/api/deploy/upload-dist/{id}` | POST | `api/services.ts` | ✅ |

---

## 七、类型定义

```typescript
// src/types/index.ts

UserInfo {
  username: string
  isSuperAdmin: boolean
  groups: UserGroup[]
  projectPermissions?: Record<string, string[]>  // key 是字符串类型的 projectId
}

UserGroup {
  id: number
  name: string
  roleName: string
  isSupervisor: boolean
}

DeployService {
  id: number
  name: string
  projectId: number        // 用于权限匹配
  projectName: string
  port: number
  volumeDir: string
  serviceType: 'backend' | 'frontend' | 'fullstack'
  serviceConfig: string
  status: 'running' | 'stopped'
  createTime: string
  updateTime: string
}

GroupMember {
  userId: number
  username: string
  roleId: number
  roleName: string
  joinedAt: string         // 后端字段名待确认
}

Role {
  id: number
  name: string
  description: string
  isPreset: boolean
  groupId?: number
}

CrossAccess {
  id: number
  userId: number
  projectId: number
  permCodes: string[]
  createTime: string
}
```

---

## 八、已知问题与待确认事项

### 8.1 前端设计问题

| # | 问题 | 严重程度 | 建议 |
|---|------|---------|------|
| 1 | **路由无权限守卫**：普通成员可直接访问 `/#/groups`、`/#/access` 等路径 | 中 | 在 AuthGuard 或各页面内增加角色校验，无权限时重定向 |
| 2 | **UserInfo 不刷新**：权限变更后需重新登录才能生效 | 低 | 可增加手动刷新或定时刷新机制 |
| 3 | **MANAGE_MEMBERS/MANAGE_PROJECTS 未使用**：前端用 isSupervisor 代替 | 低 | 确认后端是否可能给非主管角色分配这两个权限码 |
| 4 | **UserList 创建用户字段不匹配**：前端传 `role` 字符串，后端要求 `groupId` + `roleId` + `extraPermissions` | 高 | 需要重构 UserList 的创建表单 |
| 5 | **成员管理入口不明显**：后端文档说主管应有独立的"成员管理"菜单，当前只能从项目组列表点进去 | 低 | 可增加独立菜单或保持现状 |
| 6 | **RoleList 的角色来源**：superAdmin 需要遍历所有项目组获取角色，性能可能有问题 | 低 | 确认后端是否有全局角色列表接口 |

### 8.2 待确认的后端接口行为

| # | 问题 | 说明 |
|---|------|------|
| 1 | `GET /api/groups` 对普通用户的返回 | 后端文档说"普通用户只返回自己所在的项目组"，但前端 GroupList 页面目前只对 superAdmin 显示操作按钮。如果普通用户也能看到组列表，是否需要限制？ |
| 2 | `GET /api/users/list` 的权限范围 | 后端文档说"主管看自己组内的用户"，前端没有做这个过滤，是后端自动过滤还是前端需要传 groupId？ |
| 3 | `POST /api/users/create` 的请求体 | 前端当前传 `{ username, password, role }`，后端文档要求 `{ username, password, groupId, roleId, extraPermissions }`。需要对齐。 |
| 4 | 项目组详情接口返回 `memberCount` / `projectCount` | 后端文档有这两个字段，但前端 Group 接口没有定义，是否需要展示？ |
| 5 | `GroupMember.joinedAt` vs `createTime` | 后端文档用 `joinedAt`，但实际返回可能是 `createTime`，需要确认字段名 |
| 6 | 跨组授权是否可以重复授权 | 如果用户已有某项目的权限，再次授权是覆盖还是追加？前端没有做冲突检查 |
| 7 | WebSocket 权限 | 后端文档说 WebSocket 不走权限校验，建议前端在建立 WebSocket 前检查 VIEW 权限 |

### 8.3 前端与后端文档的字段名差异

| 前端字段 | 后端文档字段 | 是否一致 |
|---------|-------------|---------|
| `createTime` (Group) | `createdAt` | ⚠️ 已改为 createTime，待确认后端实际返回 |
| `createTime` (CrossAccess) | `createdAt` | ⚠️ 已改为 createTime，待确认后端实际返回 |
| `joinedAt` (GroupMember) | `joinedAt` | 待确认后端实际返回 |

---

## 九、权限判断流程图

```
用户访问页面
  │
  ├─ 无 token → /login
  │
  └─ 有 token → GET /auth/info
                  │
                  ├─ 401 → 清除 token → /login
                  │
                  └─ 200 → UserInfo 存入 Context
                            │
                            ├─ 菜单渲染
                            │   ├─ isSuperAdmin → 显示全部菜单
                            │   ├─ isSupervisor → 显示角色管理
                            │   └─ 普通成员 → 基础菜单
                            │
                            ├─ 页面渲染
                            │   ├─ 页面级：检查角色/权限，无权限可重定向
                            │   └─ 按钮级：hasPermission 控制显隐
                            │
                            └─ API 请求
                                ├─ 请求拦截器：自动附加 Authorization
                                └─ 响应拦截器：
                                    ├─ 401 → 清除 token → /login
                                    └─ 403 → 提示"权限不足"
```
