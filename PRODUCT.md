# Product

## Register

product

## Users

Any job seeker who lands on the live instance or self-hosts the project — no accounts, no passwords. A UUID identity is generated client-side at `/setup` and paired with the user's own Anthropic API key (BYOK), stored in `localStorage` only. Originally built by and for Nicholas Moffett (University of Miami junior, builder, CRE/AI intern, active job seeker); his daily-use habits are still the reference for feature priorities — opens it to track applications, get AI coaching, and find new leads, often in focused sessions late at night — but as of the multi-user launch the product is no longer single-tenant.

## Product Purpose

AI-powered job search command center. Tracks applications, surfaces leads, coaches on interviews and cover letters, and advises on strategy — scoped entirely to whoever is using it. Each user brings their own resume and API key through a 4-step setup, and the dashboard personalizes to them from that point on. Success = the user opens this instead of a spreadsheet, every time — for any user, not just the original one.

## Brand Personality

Atmospheric · Personal · Sharp

This isn't a dashboard. It's a command center that knows you. The vibe is ethereal personal project — the kind of thing you'd stumble on and wonder who built it. Handcrafted energy, not enterprise polish. Feels like an AI companion more than a tool, even though many different people now use their own instance of it.

## Anti-references

- Generic SaaS dashboards (Linear, Notion in their most neutral states) — too impersonal
- Corporate HR / ATS tools — sterile, cold, built for companies not people
- Endless card grids with the same rhythm

> Note: earlier versions of this brief also listed "glassmorphism decoration" and "the dark-navy-plus-blue-accent formula" as anti-references. The June 2026 multi-user redesign (`app/globals.css`) deliberately moved to an icy-glass aesthetic — midnight background, cyan/blue accent, backdrop-blur glass surfaces — which is exactly that formula. Flagging the conflict rather than silently resolving it: either the anti-reference was wrong for where this product ended up, or the redesign drifted from the brief. Worth a deliberate call rather than leaving stale guidance in place.

## Design Principles

1. **It knows you** — Everything is personalized to the current user. The UI should feel like it's been configured by and for one specific person, not a blank template — even though it's now the same template doing that for many different people.
2. **Atmosphere over chrome** — Use depth, glow, and subtle motion to create presence. The background is alive; the UI breathes.
3. **Companion, not tool** — The app has a personality. There's something in it that reacts, encourages, and feels alive. Not cutesy — ethereal.
4. **Information density earns its place** — Dense where tasks demand it (job table), spacious where thinking happens (coach, home).
5. **Fluid, not decorated** — Transitions and animations exist to convey state and make the experience feel seamless, not to show off.

## Accessibility & Inclusion

WCAG AA as a floor for every user, not just the original one. Full reduced-motion support. High contrast text required.
