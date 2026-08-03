# Color Craft Rules

Universal color rules applied on top of the Cold Luxury design tokens.

## Palette Structure

A coherent palette has four layers:

| Layer | Share of pixels | Tokens |
|---|---|---|
| **Neutrals** | 70-90% | `--background`, `--card`, `--foreground`, `--muted`, `--border` |
| **Accent** (one) | 5-10% | `--accent` (ice-blue) — never a second accent |
| **Semantic** | 0-5% | `--destructive`, plus inline success/warning classes |
| **Effect** | <1% | Chrome hairlines, glass panel highlights |

## Accent Discipline

- At most **2 visible uses of `--accent` per screen**. Typical pair: one chip/badge + one primary CTA
- Links count as accent use; demote to `--foreground` underline if a CTA also appears
- Hover/focus rings count as accent. Ration accordingly

## Contrast Minimums (WCAG AA)

| Pair | Minimum |
|---|---|
| Body text on background | **4.5:1** |
| Large text (>18px or 14px bold) | **3:1** |
| UI components against adjacent surfaces | **3:1** |

## Dark Theme

- No pure black (`#000`) or pure white (`#fff`). Off-black charcoal (`#0f0f0f` base), off-white for light mode
- Prefer semi-transparent white borders over solid dark borders on dark surfaces

## Anti-Defaults

- **Indigo `#6366f1`** (Tailwind indigo-500) is banned as accent. The project token is ice-blue (`--accent`)
- **Two-stop hero gradients** (purple→blue) are banned. Flat surface + type hierarchy beats gradients
- **Pure black dropshadow** on light backgrounds is banned. Shadows tinted to the background hue only
