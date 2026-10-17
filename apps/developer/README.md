# KUSH Developer

Functional M1 desktop foundation. Run from the monorepo root:

```powershell
pnpm --filter @kush/developer dev
pnpm --filter @kush/developer desktop:dev
pnpm --filter @kush/developer test
pnpm --filter @kush/developer build
pnpm --filter @kush/developer exec tauri build --no-bundle
```

The API must run at `http://127.0.0.1:4310` or `http://localhost:4310`. Profile selection is restricted to those two exact origins. Only the selected endpoint and polling interval persist in localStorage; named nonsecret profiles are stored through the authenticated API. The web development server binds only to `127.0.0.1:5173` and refuses another port. The native application uses the compiled local frontend in release builds.

Health polling uses TanStack Query; unavailable API/database responses remain visible. Sign in validates the returned token using `/auth/me`; tokens exist in component memory only. Reloading or closing the window drops the token. Sign out attempts server revocation and always clears the local session, with an explicit warning if revocation could not be confirmed. Only the endpoint and check interval are stored in localStorage; intervals are restricted to 5, 10, 30 or 60 seconds. Audit events are requested only for an administrator; the API remains responsible for enforcing authorization.

Native capabilities cover main-window controls, geometry/state reads, unminimizing and focus for bounded native verification. No shell, filesystem, remote navigation or custom native commands are exposed. Release CSP permits only the local API and Tauri IPC connections. Development CSP additionally permits Vite's loopback websocket.

`src-tauri/icons/icon.ico` is a neutral solid slate square required by the Windows resource compiler. It is a technical placeholder, not a KUSH logo or proposed brand asset. Replace it only with the approved supplied brand reference. The Rust dependency lockfile is included for repeatable builds.

Windows native builds need Rust/MSVC and the Windows SDK; running requires WebView2. The UI provides basic functional styling only. Authenticated users can browse clients/projects and export saved JSON. Operators and administrators can create and maintain client records, scope projects, define commercial proposals, record client approval evidence, track tasks, record acceptance evidence and complete handover. The API enforces roles, version conflicts and delivery prerequisites. Approval applies only to saved terms and locks the commercial scope and checklist definitions; changed terms require a new project. No external messages, signatures, payments or integrations are implied.

Administrators can create accounts, change access and reset other users' passwords with confirmation. Own password changes require the current password and end every session. A 401 clears the token and query cache; an authenticated heartbeat also checks session validity once a minute. Activity shows the API's permitted events; audit details remain administrator-only. Payments, Discord, licensing and infrastructure integrations remain unavailable.

References consulted: [Tauri configuration](https://v2.tauri.app/reference/config/) and [core permissions](https://v2.tauri.app/reference/acl/core-permissions/).
