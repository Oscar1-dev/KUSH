# Technology decisions

| Layer | Tool | Why |
|---|---|---|
| Framework | Next.js App Router | Browser site, routing, metadata, future SSR |
| Language | TypeScript | Maintainable, typed components |
| UI | React | Interactive components |
| Styling | CSS + Tailwind v4 | Full control over bespoke visuals |
| Motion | Motion for React | Scroll/pointer/entrance choreography |
| WebGL | Three.js + React Three Fiber + Drei | Optional high-end interactive 3D |
| Animation assets | Rive (future, optional) | Art-directed interactive vector animation |
| Icons | Lucide | Small UI details only |
| Backend | Existing KUSH Fastify API (future) | Reuse shared platform, avoid duplication |
| Desktop | Tauri 2 + Rust (separate product) | Not needed for a public website |

Prefer CSS and Motion for 2D. Only load WebGL scenes when they add distinct visual value; dynamically import and provide fallbacks. Keep 3D off the critical rendering path.
