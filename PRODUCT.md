# Product

## Register

product

## Users

Any job seeker who lands on the live instance or self-hosts the project — no accounts, no passwords. A UUID identity is generated client-side at `/setup` and stored in `localStorage`. AI runs server-side on a shared Groq key (`GROQ_API_KEY`); users do not supply their own key. Planned: ~$5/month via Stripe (August 2026) with per-user daily AI call caps to protect margins. Originally built by and for Nicholas Moffett (University of Miami junior, builder, CRE/AI intern); his daily-use habits are still the reference for feature priorities. As of the multi-user launch the product is no longer single-tenant — but the actual target user is still someone exactly like him: a college student, often not technical, who would otherwise be tracking applications in a spreadsheet. Design for that person specifically, not for a developer who'd be comfortable in a real terminal.

## Product Purpose

A job tracker that feels like a great spreadsheet, with two AI features that earn their place: import a job posting and get an in-depth, brutally honest fit score, and a coach that knows your background. Each user brings their resume through setup, and the dashboard personalizes to them from that point on. Success = the user opens this instead of a spreadsheet, every time.

## Brand Personality

Terminal · Minimal · Sharp

Looks like a developer tool. Operates like consumer software. The aesthetic borrows from CLI/terminal culture — monospace type, the `>` prompt as a recurring motif, a black canvas — but every interaction underneath is point-and-click, plainly labeled, and impossible to get lost in. The look is for someone who'd recognize a terminal aesthetic as "techy and cool"; the actual usability bar is a college student who has never opened one and never will. Nothing about the terminal styling is functional — there is no command input anywhere in the product. It's a skin, not an interaction model.

There is no mascot or icon mark — the brand mark tried a fox head through a couple of iterations and was removed entirely rather than kept as a half-right compromise. Personality comes from the typography and the `>` motif alone: the `jobs_` wordmark, monospace rhythm, and the prompt prefix. No logo to design around, no icon to keep legible at every size — one less thing to get wrong.

## Anti-references

- **The icy-glass aesthetic this product shipped with through mid-2026** (`app/globals.css` pre-redesign) — midnight-navy background, cyan/blue glow accents, backdrop-blur glass cards, an animated orb mascot. Deliberately replaced. Don't reintroduce glow, blur-as-decoration, or gradient accents anywhere in the new system.
- Generic SaaS dashboards (Linear, Notion in their most neutral states) — too impersonal, and not what "terminal" means here either.
- Corporate HR / ATS tools — sterile, cold, built for companies not people.
- Actual terminal emulators / CLI tools as an interaction model. The reference is the *look* of a terminal (monospace, black canvas, `>` prompts), never its *behavior*. If a feature would require someone to type a command, recall a flag, or remember syntax, it has crossed from aesthetic into interaction model and must be rebuilt as a button, form, or menu.
- Cute, animated mascots that move on their own (the old breathing/spinning orb) — and mascots/icon marks generally now; the fox mark that briefly replaced the orb was tried and cut. Don't reintroduce a character or icon mark without it being asked for again.

## Design Principles

1. **The look is a skin, the product is an iPhone.** Terminal aesthetic, zero terminal literacy required. Every screen must be usable by someone who has never seen a command line, with no exceptions made for "it looks cool this way." If a usability concern and an aesthetic preference conflict, usability wins, every time — and that includes color: status and score signals keep color (red/green/orange) even on an otherwise monochrome page, because color is faster to read than text for someone scanning quickly.
2. **One page, not a tour.** The job tracker table is the product; it gets the most space and the least friction to reach. Coach and Profile are summonable overlays, not destinations — consolidation isn't a visual style, it's fewer places to get lost.
3. **Restrained, not flat.** Primary black canvas, white/gray text, one accent (orange) used deliberately for actions and brand, plus the minimum semantic colors needed for status/score (green, red). No fourth hue. Dynamism comes from motion and typography, not from decoration — clean transitions, a blinking cursor, monospace rhythm, not gradients or glow.
4. **Honest, not flattering.** This extends past visual design into the product's voice: AI-generated scores and summaries (fit score, Candidate Strength) are calibrated to be realistic, not encouraging. The interface should look confident and sharp; the words in it should never give false hope.
5. **Density where the data is, room where the thinking is.** The tracker table is dense — many rows, many columns, no wasted padding. Overlays (Coach, Profile) get more breathing room since they're a different mode of use.

## Accessibility & Inclusion

WCAG AA as a floor — body text ≥4.5:1 against the black canvas, large/bold text ≥3:1. A monochrome-plus-one-accent palette makes this easier, not harder: verify every gray-on-black and orange-on-black pairing numerically before locking it in, don't eyeball it. Full reduced-motion support. High contrast text required.
