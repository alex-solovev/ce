# ce-tooltip

Short description of another element, shown on hover and focus. API after `wa-tooltip`:

```html
<button id="save">Save</button> <ce-tooltip for="save">Saves the <strong>draft</strong></ce-tooltip>
```

## API

- `for` (`htmlFor`): the trigger's id, looked up in the tooltip's own document or shadow root. `anchor` property: an element directly (wins over `for`; `null` goes back to `for`).
- `placement`: `top` (default), `bottom`, `left`, `right`. Flips to the opposite side when there's no room.
- `open` (reflected; set it to show), `disabled`, `show-delay` (ms, default 150), `hide-delay` (ms, default 0).
- `show()` / `hide()`: right away, no delays.
- Events: the popover's own `beforetoggle` / `toggle` on the host.
- Not included: click or manual triggers (use a popover for those), an arrow (CSS can't tell yet when the tooltip flipped), a `distance` setting (fixed `margin: 0.5em` on the host).

## Positioning

- The host is `popover="manual"`: top layer (escapes overflow and z-index), doesn't close other popovers such as an open select list.
- CSS anchor positioning in inline styles, which the OddBird polyfill can read: a unique `--ce-tooltip-N` added to the trigger's inline `anchor-name` (kept alongside its other names), `position-anchor`, `position-area` and `position-try-fallbacks` (`flip-block` / `flip-inline`) on the host.
- Browsers without anchor positioning need the polyfill (see `index.html`).
- Known limit: an `anchor-name` the trigger gets from a stylesheet is overridden by the inline one.

## Accessibility

- `role="tooltip"` through `ElementInternals`. The trigger's `ariaDescribedByElements` gets the tooltip added (kept alongside its other descriptions), so the content is the trigger's description, also while closed.
- WCAG 1.4.13: hoverable (leaving by pointer waits at least 100ms, so the pointer can reach the tooltip, which then keeps it open), dismissible (Escape closes without moving focus and stays closed until the pointer and focus have left; it's only listened to while open, and `preventDefault` keeps a surrounding dialog open), persistent (until hover and focus leave).
- Hover means a mouse or pen; touch shows it through focus (a tap on a focusable trigger).
- Rich content is allowed, interactive content isn't (documented, not enforced): the tooltip can't be focused.
- Known gap: a trigger that is a custom element with `delegatesFocus` (like `ce-select`) gets the description on its host, which its inner control doesn't inherit.

## Structure

- `logic.ts`: hover (trigger, tooltip), focus, dismissed, disabled, open; `shouldBeOpen` derived; `position(placement)`; `parseDelay`.
- `render.ts`: shadow DOM and popover, `anchor` (anchor name and description on the trigger, undone on the previous one), `position`, `open`.
- `ce-tooltip.ts`: attributes, delays (one timer), trigger listeners, the Escape listener while open.

## Performance

- A closed tooltip costs four listeners on its trigger and two on itself. No observers, no scroll or resize handlers: positioning is CSS.
- Finding the trigger is one `getElementById` on connect and when `for` changes, plus one retry on the next frame when it isn't there yet.

## Edge cases

- `for` changes, `anchor` is set, or the tooltip is removed: the previous trigger is cleaned up and the tooltip closes. Put back, it binds again.
- A pending show is dropped on removal.
- Several tooltips on one trigger: anchor names and descriptions are added, not replaced.
- `for` that matches nothing: no trigger, nothing shown, until `for` or `anchor` changes.
