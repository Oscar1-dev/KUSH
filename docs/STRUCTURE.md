# Structure

src/app/layout.tsx — SEO metadata and root shell
src/app/page.tsx — homepage route
src/app/globals.css — design tokens, layout, transitions, accessibility
src/components/interactive-hero.tsx — initial interactive homepage
src/lib/ — future shared helpers
public/ — brand assets, compressed imagery, fonts with valid licences

docs/ — architecture, art direction, roadmap

## Next refactor
Split the homepage into reusable `navigation`, `hero`, `marquee`, `studio`, `capabilities`, `manifesto`, and `footer` components. Keep animation orchestration separate from content. Avoid turning every section into a client component without need.
