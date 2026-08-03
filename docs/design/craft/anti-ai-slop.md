# Anti-AI-Slop Rules

Concrete, checkable rules that distinguish "designed by a human who has shipped product" from "default LLM output."

## The Cardinal Sins (Must Fix)

1. **Default Tailwind indigo as accent** — `#6366f1`, `#4f46e5`, `#4338ca`. The project uses ice-blue (`--accent`). Indigo is the #1 AI tell.

2. **Two-stop hero gradients** — purple→blue, blue→cyan, indigo→pink. Flat surface + intentional type hierarchy beats this every time.

3. **Emoji as feature icons** — `✨🚀🎯⚡🔥💡` inside `<h*>`, `<button>`, `<li>`. Use lucide-react monoline SVG icons with `currentColor`.

4. **Rounded card with colored left-border accent** — the canonical "AI dashboard tile" shape. Drop either the radius or the left border.

5. **Invented metrics** — "10x faster", "99.9% uptime", "3x more productive". Use real data or explicit placeholders.

6. **Filler copy** — `lorem ipsum`, `feature one / two / three`, `placeholder text`. An empty section is a design problem, solved by composition.

## Soft Tells (Should Fix)

- **Standard Hero -> Features -> Pricing -> FAQ -> CTA sequence** with no variation. Introduce at least one unconventional section.
- **More than ~12 raw hex values outside `:root`**. Tokens were not honoured.
- **`var(--accent)` used 6+ times in rendered body**. Cap at 2 visible uses per screen.

## How to Add Soul

Aim for ~80% proven patterns + ~20% distinctive choice. The 20% should live in:
- One bold visual move — a typography choice, a single color decision, an unexpected proportion
- Voice and microcopy — a button that says "Start tracking" beats "Get started"
- One micro-interaction the user remembers — a button press that moves 2px
- One detail that could only have been put there by someone who used the product
