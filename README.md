# KUSH® — Visual-first website starter

Standalone Next.js website for KUSH. Does not modify the KUSH Developer/Tauri monorepo.

## Run on Windows

1. Install Node.js and pnpm if not already installed.
2. Extract this folder somewhere outside the existing KUSH app repository (or in a separate folder under ALL PROJECTS).
3. Open PowerShell in the extracted `kush-website-starter` folder.
4. Run `pnpm install`.
5. Run `pnpm dev`.
6. Open http://localhost:3000.

Build: `pnpm build` · Typecheck: `pnpm typecheck` · Lint: `pnpm lint`.

**Important:** The archive includes source code, not `node_modules`, and dependencies have not been installed or runtime-tested in this environment. Package versions are a starter range, not a lockfile. Run `pnpm install` to generate the lockfile and verify compatibility. If your existing pnpm version differs, the `packageManager` field is advisory; use your installed version or update it deliberately.

## Included

- App Router Next.js/React/TypeScript starter.
- Responsive, high-contrast editorial landing page.
- Animated KUSH hero, pointer-reactive lighting, orbit shapes, parallax, marquee, abstract identity artwork.
- Studio, capabilities, manifesto, and contact sections.
- Reduced-motion accessibility fallback.
- Tailwind v4 integration, Motion, Three.js + R3F + Drei ready for future 3D work.
- Brand, structure, performance, and visual roadmap docs.

## Before publishing

- Replace placeholder `hello@example.com` email in `src/components/interactive-hero.tsx`.
- Replace typographic KUSH wordmark with the original brand asset when supplied.
- Confirm actual service availability before publishing claims or accepting orders.
- Add privacy/cookie information appropriate to the actual tracking and contact features you deploy.
- Verify keyboard, mobile, reduced-motion, contrast and performance on actual devices.
- No commerce, customer login, backend integration, or contact form is implemented yet.

## Note on Tauri and Rust

Tauri/Rust remain appropriate for KUSH desktop products. A public browser website does not need them. Keep this frontend independently deployable, then integrate the KUSH API through documented, authenticated endpoints later.
