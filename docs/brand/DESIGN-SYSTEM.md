# Functional design system

Status: provisional M1 guidance, not a completed component library.

| Token      | Candidate value | Purpose                  |
| ---------- | --------------- | ------------------------ |
| background | #111014         | Window canvas            |
| surface    | #1D1B22         | Functional panels        |
| text       | #F4F1F7         | Primary text             |
| muted      | #BDB5C7         | Secondary text           |
| accent     | #BFA2F5         | Focus and selected state |
| success    | #9CCD99         | Confirmed success        |
| danger     | #FFB4AB         | Errors                   |

These colours are proposed tokens, not sampled from the missing logo. Check actual rendered combinations for contrast before acceptance. Use a local system sans-serif stack and 4/8/12/16/24/32px spacing. Avoid decorative dashboard cards and charts.

Every enabled control must act. Label unavailable functions and explain the missing prerequisite. Separate loading, empty, error, disconnected and success states. Status cannot rely on colour alone. Use semantic buttons and labels, visible keyboard focus and contextual error messages; preserve user input on recoverable failure.

Custom window controls need accessible names, working minimise/maximise/restore/close, a drag region that excludes controls, resizing and keyboard access. Native multi-monitor, snapping and DPI behaviours require real Windows checks. Browser previews cannot establish native acceptance.

Use visible, operable scrolling with keyboard and trackpad support. Never hide overflow globally. Respect reduced motion and forced-colour settings; defer cinematic motion. Screenshots and accessibility checks must record the environment and actual outcomes.

Reference: [WCAG 2.2](https://www.w3.org/TR/WCAG22/), [Tauri window customisation](https://v2.tauri.app/learn/window-customization/).
