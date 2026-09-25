# ScaleLab AI staffing landing page — design reference

Inspected https://scalelabai.ca/ and its live `/style.css` on 2026-09-10. The source CSS and desktop/mobile screenshots used for reference were captured locally and are not committed.

## Observed system

| Role | Exact source value |
|---|---|
| Primary background | `#020D18` |
| Secondary background | `#0A1628` |
| Card background | `#0D1E35` |
| Terminal background | `#010810` |
| Cyan / hover | `#00D4FF` / `#1ADAFF` |
| Blue / light blue | `#0284C7` / `#38BDF8` |
| Ambient violet | `#7C5CFF` |
| Primary text | `#F2F2F2` |
| Original secondary / caption text | `#64748B` / `#445566` |
| Border / hover | `rgba(0,212,255,.12)` / `rgba(0,212,255,.30)` |
| Cyan tints | alpha `.04`, `.08`, `.10` |
| Featured card gradient | `linear-gradient(135deg,#0D1E35 0%,#0A2040 100%)` |
| CTA gradient | `linear-gradient(135deg,#020D18 0%,#0A1628 50%,#020D18 100%)` |

Outfit is used for **all** typography, including the class called `dm-mono`; it is not a second monospace font. Google Fonts supplies weights 300–800 (loaded as one variable range). Headings use 800, tight tracking, and cyan accents use synthesized italic at weight 300.

The source container is 1200px including 24px gutters; nav is 80px high, sticky, `rgba(2,13,24,.85)` with 16px backdrop blur and a thin cyan bottom border. Buttons: solid cyan/dark text or transparent/cyan outline, 600 weight, 8px radius. Cards: 16px corners, cyan hairlines, dark blue fills. Footer: `#0A1628`, logo, contact, legal links and a separated copyright row. Verified company details: ScaleLab AI, Canada, deins@scalelabai.ca; legal paths `/privacy-policy` and `/terms-of-service`.

Source shadows: button `0 4px 20px rgba(0,212,255,.28)`; hover `0 8px 32px rgba(0,212,255,.55)`; card `0 24px 56px rgba(0,212,255,.10)`; terminal `0 40px 80px rgba(0,0,0,.50), 0 0 40px rgba(0,212,255,.06)`. Hero grid is 60px with .04-alpha cyan rules; radial cyan glows, faint violet atmosphere, oversized outline word and hexagonal geometry.

Deliberate differences: secondary text `#9AAFC4` and caption text `#8CA2B8` for AA contrast (accessibility tokens, not extracted). No text below 11.2px. Mobile keeps a visible "Book a call" button in the nav instead of a hamburger because there is only one action.

## Production page structure (2026-09-14)

Direct-response flow, each section answering the next question a staffing owner has after clicking through from the email:

```
Nav: logo                                               Book a call
Hero: for industrial staffing agencies                  Illustrative calendar card:
      You already know how to find workers.             qualified employer meeting
      We help you find the companies that need them.    + the four qualification checks
      See how it works · Book a call
      Not candidate sourcing · Paid on meetings · 30-day pilot
      We find → We qualify → We book → You win (hidden ≤480px)
Employer acquisition. Not candidate sourcing.   Your agency | + | ScaleLab
The bottleneck: talent ready to place vs. employers asking (illustrative)
How it works: 6 steps, owner labelled (ScaleLab 1–5, your agency 6)
Video: 70-second walkthrough, text version, "Book a 30-minute call"
Who does what: what ScaleLab handles | what your agency handles
Economics: meeting → account → job orders → workers placed → gross profit (illustrative)
Performance model + what counts as a qualified employer meeting
FAQ: eight objections
Final CTA + what happens on the call, who it's with
Footer
Booking dialog (Google Calendar appointment schedule)
```

Visual language is unchanged from the source site. New illustrative elements (calendar card, talent-vs-employer panel, pipeline, value chain) reuse the card and terminal styles and are labelled illustrative; information is carried by text and border style, never colour alone. The poster and social image are frames from the explainer, which uses the same palette and type.

Motion: 600ms hero entrance and scroll reveals, a single booked-slot animation in the hero card, 200ms hover transforms. Everything collapses under `prefers-reduced-motion`. No autoplay, carousels, counters, marquees or countdowns.
