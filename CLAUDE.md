# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

FlowOps is a React-based DevOps deployment management dashboard. The UI is entirely in Chinese (Simplified). It manages projects, Docker services (backend/frontend/fullstack), deployments, logs, users, roles, and permissions. The frontend SPA builds directly into a Java Spring Boot backend's `static/` resources directory.

## Commands

- `npm run dev` — Start dev server (uses `.env.dev`, proxies `/auth`, `/api`, `/ws` to backend)
- `npm run build` — Type-check + production build (uses `.env.pro`)
- `npm run build:vm` — Type-check + VM/cloud build (uses `.env.vm`)
- `npm run lint` — Run ESLint

No test framework is configured — there are no tests in this project.

## Tech Stack

React 19 + TypeScript 6 + Vite 5 + Ant Design 6 + React Router DOM 7 (hash-based) + Axios

## Architecture

**Routing & Auth**: `createHashRouter` in `src/App.tsx`. An `AuthGuard` component checks `localStorage` for a token, calls `getUserInfo()`, and provides a `UserContext` (React Context) with the authenticated user's info to all child routes. All authenticated pages render inside `MainLayout` (sidebar + header + content area).

**API Layer**: Single Axios instance in `src/utils/request.ts` with token injection and response unwrapping. All responses follow `ApiResponse<T> = { code, msg, data }`. Domain-specific API modules live in `src/api/` (one file per entity: `auth.ts`, `projects.ts`, `services.ts`, `users.ts`, `members.ts`, `roles.ts`, `access.ts`, `stats.ts`, `logs.ts`).

**State Management**: No external store. Single `UserContext` for auth. All other state is component-local (`useState` + `useEffect` for data fetching). No React Query/SWR — pages fetch data directly in `useEffect` on mount.

**Path Alias**: `@/*` maps to `./src/*` (configured in both `vite.config.ts` and `tsconfig.app.json`).

**Permission Model**: Three-tier RBAC — `superAdmin` (global), `supervisor` (per-project), and regular users with granular permission codes (VIEW, DEPLOY, START, STOP, UPLOAD, EDIT_CONFIG, DELETE, MANAGE_MEMBERS, MANAGE_PROJECTS). Use `hasPermission()` and `isSupervisor()` from `src/utils/permission.ts` to check permissions in components.

**Styling**: No CSS modules, Tailwind, or styled-components. All styling uses Ant Design components + inline `style` objects. The app uses `ConfigProvider` with `zhCN` locale.

**WebSocket**: Raw WebSocket connections to `/ws/container-logs` for real-time log tailing in `LogDrawer` and `ContainerLogs`.

**Types**: All shared TypeScript interfaces are in a single file `src/types/index.ts`. Some pages define local interfaces inline (e.g., `ServiceEdit.tsx` has `ProxyDirective`, `ProxyRule`, `ServiceConfig`).

## Key Conventions

- All user-facing text is hardcoded Chinese strings (no i18n framework)
- Pages are flat single-file components in `src/pages/` — no component decomposition pattern
- Data fetching pattern: `useState` for data/loading, `useEffect` on mount, `message.error()` for errors
- Forms use Ant Design's `<Form>` component directly (no react-hook-form)
- The `request.ts` Axios interceptor automatically unwraps `response.data` — API call results are the `ApiResponse<T>` object, not raw Axios responses
- Environment files (`.env.dev`, `.env.pro`, `.env.vm`) are gitignored; `.env.example` is the template

## File Reference

| Purpose | Path |
|---|---|
| Entry point | `src/main.tsx` |
| Router + auth guard + context | `src/App.tsx` |
| Layout shell | `src/layouts/MainLayout.tsx` |
| Axios instance + interceptors | `src/utils/request.ts` |
| Env config wrapper | `src/config/env.ts` |
| All type definitions | `src/types/index.ts` |
| Permission helpers | `src/utils/permission.ts` |
| Vite config | `vite.config.ts` |
| ESLint config | `eslint.config.js` |
