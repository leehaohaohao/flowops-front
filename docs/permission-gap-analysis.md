# FlowOps 权限系统 — 前后端对接差距分析与实施计划

## 一、背景

前端已完成权限系统的基础框架（AuthGuard、UserContext、hasPermission、isSupervisor），但对照后端 11 个 Controller 的实际实现，存在多处接口字段不匹配、逻辑缺失、安全隐患等问题。本文档逐项列出差距并给出修复方案。

---

## 二、后端权限架构概要

### 2.1 权限模型

```
Super Admin (isSuperAdmin=1)
  └─ 绕过所有权限检查，通过 @SaCheckRole("super_admin") 控制

项目组 (project_group)
  └─ 成员 (group_member) → 角色 (perm_role) → 权限 (role_permission)
       └─ 每个成员额外有 extraPermissions（逗号分隔，与角色权限取并集）

项目 (project)
  └─ 服务 (deploy_service)
  └─ 跨组授权 (project_access) → 单条 permCode 记录
```

### 2.2 后端权限注解

| 注解 | 机制 | 用途 |
|------|------|------|
| `@SaCheckRole("super_admin")` | Sa-Token 角色检查 | 仅超级管理员 |
| `@RequireGroupSupervisor("groupId")` | AOP，解析 groupId 来源 | 主管 + 超级管理员 |
| `@RequirePermission(value="CODE", projectId="expr")` | AOP，检查项目级权限码 | 按权限码控制 |
| 无注解 | 手动过滤或无校验 | 见各 Controller |

### 2.3 后端 45 个接口清单

| # | 方法 | 路径 | Controller | 权限机制 |
|---|------|------|-----------|---------|
| 1 | POST | `/auth/login` | AuthController | 无 |
| 2 | POST | `/auth/logout` | AuthController | 无 |
| 3 | GET | `/auth/info` | AuthController | 无（需有效 token） |
| 4 | GET | `/api/groups` | ProjectGroupController | 手动过滤（superAdmin 全部，其他仅自己的组） |
| 5 | POST | `/api/groups` | ProjectGroupController | `@SaCheckRole("super_admin")` |
| 6 | GET | `/api/groups/{id}` | ProjectGroupController | 无（返回含 memberCount, projectCount） |
| 7 | PUT | `/api/groups/{id}` | ProjectGroupController | `@SaCheckRole("super_admin")` |
| 8 | DELETE | `/api/groups/{id}` | ProjectGroupController | `@SaCheckRole("super_admin")`（默认项目组不可删除） |
| 9 | GET | `/api/groups/{groupId}/members` | MemberController | `@RequireGroupSupervisor("groupId")` |
| 10 | POST | `/api/groups/{groupId}/members` | MemberController | `@RequireGroupSupervisor("groupId")` |
| 11 | PUT | `/api/groups/{groupId}/members/{userId}` | MemberController | `@RequireGroupSupervisor("groupId")` |
| 12 | DELETE | `/api/groups/{groupId}/members/{userId}` | MemberController | `@RequireGroupSupervisor("groupId")` |
| 13 | GET | `/api/projects` | ProjectController | 手动过滤（superAdmin 全部，其他按 visibleProjectIds） |
| 14 | POST | `/api/projects` | ProjectController | `@RequireGroupSupervisor("params.groupId")` |
| 15 | GET | `/api/projects/{id}` | ProjectController | **无** |
| 16 | PUT | `/api/projects/{id}` | ProjectController | `@RequireGroupSupervisor("project:id")` |
| 17 | DELETE | `/api/projects/{id}` | ProjectController | `@RequireGroupSupervisor("project:id")` |
| 18 | GET | `/api/roles/presets` | RoleController | **无** |
| 19 | GET | `/api/roles?groupId=` | RoleController | **无** |
| 20 | GET | `/api/roles/{id}/permissions` | RoleController | **无** |
| 21 | POST | `/api/roles` | RoleController | **无** |
| 22 | PUT | `/api/roles/{id}` | RoleController | **无** |
| 23 | DELETE | `/api/roles/{id}` | RoleController | **无** |
| 24 | GET | `/api/users/list` | UserController | 手动过滤（superAdmin 全部，supervisor 本组用户） |
| 25 | POST | `/api/users/create` | UserController | 手动检查（superAdmin 或目标组 supervisor） |
| 26 | DELETE | `/api/users/{id}` | UserController | `@SaCheckRole("super_admin")` |
| 27 | POST | `/api/access/grant` | PermissionController | `@SaCheckRole("super_admin")` |
| 28 | GET | `/api/access?userId=` | PermissionController | `@SaCheckRole("super_admin")` |
| 29 | DELETE | `/api/access/{id}` | PermissionController | `@SaCheckRole("super_admin")` |
| 30 | GET | `/api/services/list` | ServiceController | 手动过滤（visibleProjectIds） |
| 31 | GET | `/api/services/{id}` | ServiceController | `@RequirePermission("VIEW")` |
| 32 | POST | `/api/services/create` | ServiceController | `@RequirePermission("EDIT_CONFIG", "params.projectId")` |
| 33 | PUT | `/api/services/{id}` | ServiceController | `@RequirePermission("EDIT_CONFIG")` |
| 34 | DELETE | `/api/services/{id}` | ServiceController | `@RequirePermission("DELETE")` |
| 35 | POST | `/api/deploy/upload/{serviceId}` | DeployController | `@RequirePermission("UPLOAD")` |
| 36 | POST | `/api/deploy/upload-dist/{serviceId}` | DeployController | `@RequirePermission("UPLOAD")` |
| 37 | POST | `/api/deploy/start/{serviceId}` | DeployController | `@RequirePermission("DEPLOY")` |
| 38 | POST | `/api/deploy/stop/{serviceId}` | DeployController | `@RequirePermission("STOP")` |
| 39 | POST | `/api/deploy/restart/{serviceId}` | DeployController | `@RequirePermission("DEPLOY")` |
| 40 | POST | `/api/deploy/remove/{serviceId}` | DeployController | `@RequirePermission("DELETE")` |
| 41 | GET | `/api/deploy/status/{serviceId}` | DeployController | `@RequirePermission("VIEW")` |
| 42 | GET | `/api/deploy/logs/{serviceId}` | DeployController | `@RequirePermission("VIEW")` |
| 43 | GET | `/api/logs/list` | LogController | **无** |
| 44 | GET | `/api/logs/content` | LogController | **无** |
| 45 | GET | `/api/stats/dashboard` | StatsController | **无** |

---

## 三、逐项差距分析

### 3.1 【严重】UserList 创建用户 — 接口字段不匹配

**后端 `CreateUserRequest`：**
```java
{
  "username": "zhangsan",
  "password": "123456",
  "groupId": 1,          // 可选，不传则自动归入默认项目组
  "roleId": 3,           // 必填，基础角色 ID
  "extraPermissions": ["UPLOAD", "DELETE"]  // 可选，额外权限码
}
```

**后端行为（已更新）：**
- `groupId` 可不传，自动归入默认项目组
- 默认项目组不可删除（`DELETE /api/groups/{id}` 返回"默认项目组不可删除"）
- 非超级管理员创建用户到默认组时，需要是默认组的 supervisor

**前端当前 `createUser`：**
```typescript
{ username, password, role }  // role 是字符串 "admin"/"user"，完全对不上
```

**差距：**
- `role` 字段是旧版遗留字段，后端已不再使用，应改为 `roleId`（必填）
- 缺少 `groupId`（可选，不传归入默认组）
- 缺少 `extraPermissions`（可选，补充权限）

**修复方案：**
- 重构 UserList 页面的创建表单
- 增加 Select 选择项目组（调用 `getGroupList`）
- 增加 Select 选择角色（调用 `getGroupRoles(groupId)`，联动项目组选择）
- 增加 CheckboxGroup 选择补充权限（可选）
- 主管只能选择自己管理的组，不能分配 supervisor 角色

---

### 3.2 【严重】CrossAccess 跨组授权 — 返回结构不匹配 + 聚合撤销交互

**后端 `ProjectAccess` 实体：**
每条记录只存一个 permCode：`{ id, userId, projectId, permCode, createTime }`

**前端假设：** `permCodes` 是数组 — 不匹配，渲染会出错。

**修复：前端聚合展示**

获取列表后按 `(userId, projectId)` 分组，合并为聚合结构：
```typescript
interface AggregatedAccess {
  userId: number
  projectId: number
  items: Array<{ id: number; permCode: string; createTime: string }>
}
```

**撤销交互细化：**
- 聚合行内每个权限 Tag 旁增加 `x` 按钮，点击撤销单条（调用 `DELETE /api/access/{id}`）
- 行尾增加"全部撤销"按钮，批量删除该行所有 `items`
- 单条撤销后从 `items` 中移除该条，若 `items` 为空则整行消失
- 不能直接按聚合行删除（会误删同一项目上的其他权限条目）

---

### 3.3 【严重】MemberList 添加成员 — 缺少 extraPermissions

**后端 `AddMemberRequest`：**
```java
{ userId, roleId }
```

后端 `GroupMember` 实体有 `extraPermissions` 字段（逗号分隔），但 `AddMemberRequest` 没有这个字段。

**问题：** 添加成员时无法设置补充权限。补充权限只能在创建用户时通过 `CreateUserRequest.extraPermissions` 设置。

**待确认：** 后端是否需要在 `AddMemberRequest` 中增加 `extraPermissions` 字段？或者是否有单独的接口修改成员的 extraPermissions？

---

### 3.4 【中等】MemberList 成员列表 — 时间字段名待确认

**前端假设：** `joinedAt`
**后端 `GroupMember` 实体字段：** `createTime`（通过 `@TableField(fill = FieldFill.INSERT)` 自动填充）

**修复：** 将前端 `GroupMember` 类型的 `joinedAt` 改为 `createTime`，页面 dataIndex 同步修改。

---

### 3.5 【中等】GroupList 项目组详情 — 缺少 memberCount/projectCount + 默认组保护

**后端 `getById` 返回：**
```json
{ "id": 1, "name": "前端组", "description": "...", "memberCount": 5, "projectCount": 3 }
```

**前端 `Group` 接口：**
```typescript
{ id, name, description, createTime }
```

**差距：**
- 缺少 `memberCount` 和 `projectCount`，可考虑在列表中展示
- 默认项目组不可删除，前端删除按钮应对默认组做特殊处理（禁用或隐藏），避免调用后端报错

**修复：** 补充 Group 类型定义，列表中增加成员数/项目数列。

---

### 3.6 【中等】RoleList 角色管理 — 后端无权限校验

**后端 `RoleController`：** 所有 6 个接口均无权限注解，任何登录用户都能创建/编辑/删除角色。

**前端控制：** `isSupervisor(userInfo)` 控制操作按钮。

**风险：** 如果普通用户直接调用 `POST /api/roles`，后端不会拒绝。这是一个**后端安全漏洞**。

**建议：** 后端 `RoleController` 的 `create`、`update`、`delete` 应增加 `@RequireGroupSupervisor` 或 `@SaCheckRole` 注解。前端保持现有控制不变。

---

### 3.7 【中等】路由无权限守卫

**现状：** 所有受保护路由在 `AuthGuard` 下，但 `AuthGuard` 只检查是否登录，不检查角色/权限。

**风险：** 普通成员手动输入 `/#/groups`、`/#/access`、`/#/users` 可以访问这些页面。

**可行性说明：** `isSupervisor(userInfo, groupId)` 可行，因为 `/auth/info` 返回的 `groups` 数组中每个组都有 `isSupervisor` 字段，前端可以判断用户是否为指定组的主管。`isSuperAdmin` 同样来自 `/auth/info`。因此路由守卫的判断条件在前端是完整的。

**修复方案：**
- 各页面组件内 `useEffect` 检查权限，无权限时 `navigate('/dashboard')`
- GroupList / UserList / CrossAccess：`!isSuperAdmin` → 重定向
- MemberList：`!isSuperAdmin && !isSupervisor(userInfo, gid)` → 重定向
- RoleList：`!isSuperAdmin && !isSupervisor(userInfo)` → 重定向

---

### 3.8 【低】UserInfo 缓存不刷新

**现状：** `AuthGuard` 在应用启动时获取一次 `UserInfo`，之后不再刷新。如果用户权限被其他管理员修改，需要重新登录才能生效。

**建议：** 暂不处理，作为已知限制记录。后续可增加"刷新权限"按钮或定时轮询。

---

### 3.9 【中等】前端缺少权限码中文映射

**现状：** CrossAccess、RoleList 等页面直接显示英文权限码（`DEPLOY`、`UPLOAD`），用户体验差。

**修复方案：** 在 `src/utils/permission.ts` 中增加共享映射常量：

```typescript
export const PERM_LABEL: Record<string, string> = {
  VIEW: '查看',
  DEPLOY: '部署',
  START: '启动',
  STOP: '停止',
  UPLOAD: '上传',
  EDIT_CONFIG: '编辑配置',
  DELETE: '删除',
  MANAGE_MEMBERS: '管理成员',
  MANAGE_PROJECTS: '管理项目',
}
```

CrossAccess、RoleList、UserList（创建表单补充权限）统一引用此映射。

---

### 3.10 【已确认】角色-项目组联动

**待确认项已解决：** 后端文档 7.2 节明确 `GET /api/roles?groupId=1` 返回"预设角色 + 该组的自定义角色"。

**前端影响：**
- MemberList 添加成员时，角色 Select 调用 `getGroupRoles(groupId)` 即可获取所有可用角色（预设 + 自定义）
- RoleList 当前遍历所有组获取角色再去重，逻辑正确但效率不高（superAdmin 场景下 N+1 请求）
- 建议后端增加 `GET /api/roles`（不传 groupId）返回全部角色的接口，供 superAdmin 的 RoleList 使用

---

### 3.11 【低】日志接口无权限控制

**后端 `LogController`：** `/api/logs/list` 和 `/api/logs/content` 无任何权限校验。

**前端 `DeployLogs` 页面：** 无权限控制，所有登录用户可查看所有部署日志。

**建议：** 这是后端问题，前端暂不处理。后端应考虑对日志接口增加 `@RequirePermission("VIEW")` 或按项目过滤。

---

### 3.12 【低】StatsController 无权限控制

**后端：** `/api/stats/dashboard` 无权限校验，所有登录用户可查看仪表盘统计。

**前端：** Dashboard 页面无权限控制。影响较小（统计数据不敏感），暂不处理。

---

### 3.13 【低】ProjectController.getById 无权限校验

**后端：** `GET /api/projects/{id}` 无权限注解，任何登录用户可通过 ID 查看任意项目详情。

**影响：** 前端 ServiceList 和 ProjectList 中调用了此接口获取项目名称。信息泄露风险较低（项目名和描述），但建议后端补充校验。

---

## 四、后端安全建议（需后端配合修改）

| # | 问题 | 建议 | 优先级 |
|---|------|------|--------|
| 1 | RoleController 全部接口无权限校验 | create/update/delete 增加 `@RequireGroupSupervisor` 或手动检查 | 高 |
| 2 | LogController 无权限校验 | 增加 `@RequirePermission("VIEW")` 或按项目过滤 | 中 |
| 3 | ProjectController.getById 无权限校验 | 增加可见性检查或 `@RequirePermission("VIEW")` | 低 |
| 4 | StatsController 无权限校验 | 影响小，可暂不处理 | 低 |
| 5 | AddMemberRequest 缺少 extraPermissions | 如需在添加成员时设置补充权限，需增加此字段 | 低 |

---

## 五、前端修复计划

### 第一阶段：修复接口不匹配（必须）

#### 5.1 重构 UserList 创建用户表单

**文件：** `src/pages/UserList.tsx`, `src/api/users.ts`, `src/types/index.ts`

**改动：**
- `api/users.ts`：`createUser` 参数改为 `{ username, password, groupId?, roleId, extraPermissions? }`
- `types/index.ts`：`SysUser` 补充 `groupId?`、`roleName?` 字段
- `UserList.tsx`：
  - 创建表单增加"项目组"Select（调用 `getGroupList`），可不选（默认归入默认项目组）
  - 增加"角色"Select（调用 `getGroupRoles(groupId)`，联动项目组选择）
  - 增加"补充权限"CheckboxGroup（可选）
  - 主管只能选择自己管理的组
  - 角色选择后，角色已包含的权限自动勾选且不可取消（调用 `getRolePermissions`）
  - 删除旧的 `role` 字段

**后端行为备注：**
- `groupId` 不传时自动归入默认项目组
- 默认项目组不可删除，系统保证始终存在
- 非超级管理员创建用户到默认组时，需要是默认组的 supervisor

#### 5.2 修复 CrossAccess 返回结构 + 聚合撤销交互

**文件：** `src/pages/CrossAccess.tsx`, `src/types/index.ts`

**改动：**
- `types/index.ts`：`CrossAccess` 改为单条记录结构 `{ id, userId, projectId, permCode, createTime }`
- `CrossAccess.tsx`：
  - 获取列表后按 `(userId, projectId)` 分组聚合为 `AggregatedAccess`
  - 表格展示聚合数据，权限列渲染为可关闭的 Tag
  - 每个 Tag 旁 `x` 按钮 → 调用 `DELETE /api/access/{id}` 撤销单条
  - 行尾"全部撤销"按钮 → 批量删除该行所有 items
  - 单条撤销后即时从 items 中移除，items 为空则整行消失

#### 5.3 修复 MemberList 时间字段

**文件：** `src/types/index.ts`, `src/pages/MemberList.tsx`

**改动：**
- `GroupMember.joinedAt` → `createTime`
- `MemberList.tsx` 列定义 dataIndex 同步修改

### 第二阶段：增强功能（建议）

#### 5.4 补充 GroupList 统计信息 + 默认组保护

**文件：** `src/api/groups.ts`, `src/pages/GroupList.tsx`

**改动：**
- `Group` 接口增加 `memberCount`、`projectCount`
- 列表增加"成员数"、"项目数"列
- 默认项目组的删除按钮禁用或隐藏（后端会返回"默认项目组不可删除"）

#### 5.5 增加路由权限守卫

**文件：** 各页面组件

**改动：** 在以下页面增加权限检查，无权限重定向 `/dashboard`：
- `GroupList` → `isSuperAdmin`
- `UserList` → `isSuperAdmin`
- `CrossAccess` → `isSuperAdmin`
- `MemberList` → `isSuperAdmin || isSupervisor(userInfo, groupId)`
- `RoleList` → `isSuperAdmin || isSupervisor(userInfo)`

#### 5.6 角色管理：编辑时显示角色已有权限

**文件：** `src/pages/RoleList.tsx`

**现状：** 编辑角色时调用 `getRolePermissions` 获取权限列表，已实现。
**优化：** 预设角色可以查看权限但不可编辑（后端可能拒绝修改预设角色），前端可增加提示。

#### 5.7 增加权限码中文映射

**文件：** `src/utils/permission.ts`（新增常量）, `src/pages/CrossAccess.tsx`, `src/pages/RoleList.tsx`, `src/pages/UserList.tsx`

**改动：**
- 在 `permission.ts` 中新增 `PERM_LABEL` 映射常量（见 3.9 节）
- CrossAccess 权限 Tag 渲染改为 `PERM_LABEL[p] || p`
- RoleList 权限 Checkbox label 改为中文
- UserList 创建表单补充权限 Checkbox 同步修改

---

## 六、待确认事项清单

| # | 问题 | 状态 | 影响 |
|---|------|------|------|
| 1 | `GroupMember` 后端返回的时间字段是 `createTime` 还是 `joinedAt`？ | 已确认 `createTime` | 5.3 修复 |
| 2 | `AddMemberRequest` 是否需要增加 `extraPermissions` 字段？ | 待确认 | 添加成员时能否设补充权限 |
| 3 | `RoleController` 无权限校验是否为设计意图？ | 待确认 | 安全风险 |
| 4 | `GET /api/users/list` 对主管是否只返回本组用户？ | 待确认 | 添加成员时用户列表范围 |
| 5 | 跨组授权重复授权同一 (user, project, permCode) 时的行为？ | 待确认 | 前端是否需要提示冲突 |
| 6 | `GET /api/projects/{id}` 无权限校验是否为设计意图？ | 待确认 | 信息泄露风险 |
| 7 | 预设角色是否可以修改/删除？ | 待确认 | RoleList 操作按钮逻辑 |
| 8 | 部署记录（DeployRecord）是否有查询接口？ | 待确认 | 是否需要部署历史页面 |
| 9 | `GET /api/roles?groupId=` 返回预设+自定义角色 | 已确认 | 无需改动 |

---

## 七、实施优先级

```
P0（必须修复，否则功能不可用）：
  ├── 5.1 重构 UserList 创建用户表单
  ├── 5.2 修复 CrossAccess 返回结构 + 聚合撤销交互
  └── 5.7 增加权限码中文映射

P1（应当修复，影响体验/正确性）：
  ├── 5.3 修复 MemberList 时间字段
  └── 5.5 增加路由权限守卫

P2（建议优化）：
  ├── 5.4 补充 GroupList 统计信息 + 默认组保护
  └── 5.6 角色管理优化

后端配合：
  ├── RoleController 增加权限校验
  ├── LogController 增加权限校验
  ├── AddMemberRequest 增加 extraPermissions
  └── GET /api/roles 增加无参接口（返回全部角色，供 superAdmin 使用）
```
