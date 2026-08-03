# Animation Craft Rules

Universal animation discipline for Org Engine Editor UI.

## When Motion Earns Its Place

Animate only when the user is moving through space, time, or state:
- Page entry / transitions between views
- Container expansion (panels, modals, sheets)
- Progress indicators during execution
- State confirmation (run started, action completed)

Do NOT animate to teach, decorate, signal "premium", or fill silence.

## Duration Thresholds

| Duration | Use |
|---|---|
| 50-100ms | Instant feedback (button press, toggle commit, hover) |
| 150ms | Default for state confirmation |
| 200-300ms | Entering UI (modals, sheets, dropdowns) |
| 300-500ms | Cross-view transitions, container morphs |
| >500ms | Reserved for staged transitions only |

Non-navigation microinteractions must stay under 500ms. Frequent animations (seen 50x/session) stay under 200ms.

## Easing

Default easing: `cubic-bezier(0.16, 1, 0.3, 1)` — front-loaded, decisive exit.

- Use a **curve** for opacity, color, and value changes between two known points
- Use a **spring** for position, scale, rotation — anything physical

## Reduced Motion

Every animation that translates, scales, rotates, or parallaxes MUST respect `prefers-reduced-motion: reduce`.

Working rule: strip motion-on-axis (translate, scale, rotate, parallax). Keep opacity/color crossfades as substitutes.

## Anti-Patterns

- No decorative motion in working views (Studio panels, Run Monitor)
- No hero choreography in a productivity tool
- No looping spinners past 60 seconds
- Animation as the only signal of state change — always pair with static affordance (color, position, label)
- Ignoring `prefers-reduced-motion` on transform-based animations — the highest-cost vestibular triggers
