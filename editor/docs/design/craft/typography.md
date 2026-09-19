# Typography Craft Rules

Universal typography rules for Org Engine Editor UI.

## Type Scale

Use a 1.25 multiplicative scale. Cap at 6-8 sizes per view.

| Role | Range |
|---|---|
| Display | 32-48px |
| H1 | 24-32px |
| H2 | 20-24px |
| Body | 14-16px |
| Small | 12-13px |
| Caption | 10-11px |
| Mono data | 11-13px |

## Letter-Spacing — The Most Skipped Rule

| Context | Letter-spacing |
|---|---|
| Body text (14-16px) | `0` (default) |
| Small text (11-13px) | `0.01em` to `0.02em` |
| UI labels and button text | `0.02em` |
| **ALL CAPS** | **`0.08em` to `0.1em` (required)** |
| Headings 24px+ | `-0.01em` to `-0.02em` |

ALL CAPS without positive tracking reads as cramped and amateur.

## Line Height

| Size | Line height |
|---|---|
| Display / H1 (>=24px) | `1.0`-`1.2` |
| Body (14-16px) | `1.5`-`1.6` |
| Small (<=13px) | `1.5` |

## Font Pairing

- Maximum 2 typefaces per view (Geist + Geist Mono count as 1 variable + 1 mono)
- Display type: Geist Display
- Body: Geist
- Mono/data: Geist Mono
- Never `font-family: system-ui` alone on a heading — pair with Geist first
- No mixing serif with sans inside the same view

## Three-Weight System

- **Read (400)** — body copy
- **Emphasize (510/550)** — UI text, labels, navigation
- **Announce (590/600)** — headlines, buttons

Weight 700+ is rarely needed.

## Common Mistakes

- ALL CAPS without `letter-spacing >= 0.08em`
- Display text without negative tracking
- More than 3 type sizes visible above the fold
- Body copy in `text-align: justify`
