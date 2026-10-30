# ce-select plan

One element covers select, searchable select and multi-select. WAI-ARIA treats the plain variant as a "select-only combobox", so it's one pattern with an optional text field. Mode-specific code stays in a few named functions (trigger, key handling, selection), not scattered `if (searchable)` checks.

```html
<ce-select name="fruit" multiple searchable placeholder="Pick…" with-clear>
  <ce-option value="apple" selected>Apple</ce-option>
  <ce-option value="pear" disabled>Pear</ce-option>
</ce-select>
```

## Architecture

- **Reducer** (`src/ce-select/select-state.js`): pure `reduce(state, action) → state`. No DOM. Enforces invariants, so the component can't reach broken states.
- **Component** (`src/ce-select/ce-select.js`): `#dispatch(action)` runs the reducer, then `#render(prev, next)` updates only what changed (trigger text, option states, popover, form value, ARIA), then fires events.
- **Events** only fire for user actions that change the value (`input` + `change`), never for programmatic `value` / `options` changes, matching native `<select>`.
- **Options are the light DOM.** `ce-option` children are the single source. The `options` setter generates `ce-option` children, and a `MutationObserver` turns any DOM change into one `OPTIONS_CHANGED` action.

### State

| Field                                | Notes                                                                        |
| ------------------------------------ | ---------------------------------------------------------------------------- |
| `options`                            | Snapshot `{ value, label, disabled }[]` in DOM order.                        |
| `selection`                          | `{ value, label }[]` in selection order. Single mode: length ≤ 1. See below. |
| `open`                               | Popup open.                                                                  |
| `highlighted`                        | Value of the highlighted option, or `null`.                                  |
| `query`                              | Search text (searchable only).                                               |
| `multiple`, `searchable`, `disabled` | Mirrors attributes / effective disabled state.                               |

### Selection is independent of options

Options are only candidates to pick from; the selection is the source of truth for the value. This avoids the "value applied, but the select shows empty" bug in async/searchable selects, where the selected option is no longer among the current options (new search results, options reloaded after navigating back in a multi-step form).

- Selecting an option stores its `value` and `label` in `selection`.
- Removing or replacing options never changes `selection`. The display keeps showing the stored label.
- A value set in code without a matching option is stored with `label: null`. When an option with that value appears, its label is filled in. Until then the display shows the raw value.
- The form value always comes from `selection`, matched or not.

**Decision:** always keep both value and label of selected options that are no longer among the options. No attribute to change this, and no "unmatched" state. Dependent fields (e.g. car make → model) are the app's job: reset the model when the make changes. A stale value stays visible and fixable; a dropped one disappears silently.

Web Awesome's `wa-select` does the opposite: it keeps unmatched values internally, but the `value` getter, form value and display label only include values whose option is currently in the DOM, which leads to exactly that empty-select bug.

### Actions

`OPTIONS_CHANGED`, `SET_VALUE` (programmatic), `SELECT` (user, single), `TOGGLE` (user, multiple), `CLEAR`, `OPEN`, `CLOSE`, `HIGHLIGHT` (`next` / `prev` / `first` / `last` / value), `TYPEAHEAD` (char), `QUERY` (text), `CONFIG` (`multiple` / `searchable`), `DISABLED`, `RESET` (to default-selected), `RESTORE` (form state).

### Invariants (checked after every action, covered by reducer tests)

- Single mode: `value.length ≤ 1`.
- `selection` has no duplicate values.
- `OPTIONS_CHANGED` never removes from `selection`; it only fills in `label: null` entries and refreshes labels of matching options.
- `highlighted` is `null` or a visible, enabled option.
- `disabled` ⇒ `open === false`. User actions are ignored while disabled.
- Closed ⇒ `query === ""` and `highlighted === null`.
- Disabled options can't be selected by the user, but can be selected programmatically (like native).

## Phases

Each phase ends with tests passing and a demo update, ready for review.

### Phase 0: internal label (core) — done

- External `<label for>` / wrapping `<label>` don't name the focusable element inside the shadow DOM. Decision: don't support them; every form control has its own label.
- `setupFieldLabel` / `updateFieldLabel` in `src/core/field-label.js`: `<label part="label">` with a `label` slot inside the shadow root, filled by the `label` attribute when nothing is slotted. Names the control via `ariaLabelledByElements`, focuses it on click, hidden when empty.
- `label` property on `FormControl`. Applied to `ce-input` first; `ce-select` uses it from the start (the trigger is the control).

### Phase 1: reducer

- `select-state.js` with `initialState`, `reduce`, and all actions above.
- Unit tests per action plus the invariants, including the corner cases below that don't need the DOM.

### Phase 2: `ce-option`

- Attributes: `value`, `disabled`, `selected` (default selection, like native `<option selected>`), `label` (optional; otherwise trimmed `textContent`).
- `role="option"`, `ariaSelected`, `ariaDisabled` via `ElementInternals`.
- Custom states for styling: `:state(selected)`, `:state(highlighted)`, `:state(filtered-out)`. Filtering hides via a state, not the `hidden` attribute, so we never mutate user DOM (and don't trigger our own `MutationObserver`).
- `start` slot for an icon. Check mark shown when selected in multiple mode.
- Options are controlled by the select; `ce-option` has no behaviour on its own.

### Phase 3: single select (plain)

- Shadow DOM: trigger box (`part="base"`, `role="combobox"`, `tabindex="0"`, `aria-haspopup="listbox"`, `aria-expanded`), display text (`part="display"`), chevron icon, listbox (`part="listbox"`, `role="listbox"`, `popover="manual"`) containing the default slot.
- Positioning: CSS anchor positioning (`anchor-name` on the trigger, `position-anchor` on the popover), `position-try-fallbacks: flip-block`, width `anchor-size(width)`, max-height with scroll.
- Highlight via `trigger.ariaActiveDescendantElement = option`. Scroll highlighted option into view (`block: "nearest"`).
- Keyboard (APG select-only combobox):
  - Closed: `↓` / `↑` / `Enter` / `Space` / `Alt+↓` open; `Home` / `End` open at first / last; printable chars open and type-ahead.
  - Open: `↓` / `↑` move, `Home` / `End`, `PageUp` / `PageDown` (10 items), `Enter` / `Space` select and close, `Escape` closes without change, `Tab` selects highlighted and moves on, `Alt+↑` selects and closes.
  - Type-ahead: buffer chars for 500 ms, match label prefix case-insensitively, repeated same char cycles.
- Mouse: click trigger toggles; click option selects; `mousedown` on listbox `preventDefault` to keep focus on the trigger; click outside closes (listen on the root node, not `document`, so it works inside shadow roots).
- Focus leaving the component closes without change.
- Opening highlights the selected option, or the first enabled one.
- Form: `setFormValue(value)` or `null` when nothing is selected. `formResetCallback` → `RESET`. `formStateRestoreCallback` → `RESTORE`. `formDisabledCallback` → `DISABLED`.
- Enter while closed: implicit submit via `submitImplicitly`, like `ce-input`.
- Placeholder when empty.

### Phase 4: option sources

- `MutationObserver` on the host: `childList`, `subtree`, `characterData`, and attributes `value` / `disabled` / `selected` / `label`. Batch to one `OPTIONS_CHANGED` per microtask.
- `options` setter: `[{ value, label, disabled, selected }]` → replaces children with generated `ce-option` elements. Getter returns the snapshot.
- `value` setter before options exist → stored with `label: null`, filled in when options arrive.
- Replacing all options (e.g. new search results) keeps the selection and its labels.

### Phase 5: multiple

- `multiple` attribute: `TOGGLE` instead of `SELECT`; listbox stays open; `aria-multiselectable` on the listbox.
- Keyboard: `Space` toggles highlighted, `Enter` toggles and keeps open, `Escape` closes.
- Display: selected labels comma-separated in selection order, single line, `text-overflow: ellipsis`. Full text in `title`.
- Selected values that aren't among the current options still count, are submitted, and show their stored label.
- Form value: `FormData` with one entry per value under `name`. Rebuild when `name` changes.
- `value` property: `string[]` in multiple mode, `string` in single mode.

### Phase 6: searchable

- Trigger becomes an `<input role="combobox" aria-autocomplete="list">` (same `part="base"` box).
- Typing → `QUERY`: opens, filters by case-insensitive substring of label, highlights first match.
- "No results" row (`part="no-results"`, not an option) when nothing matches.
- Closed, single: input shows the selected label. Open: input shows the query.
- Closed, multiple: input shows comma-separated labels; opening clears it for typing.
- `Backspace` in an empty query doesn't remove selections (keep it simple).
- Type-ahead is disabled; typing goes to the query instead.
- Focus selects the input text, so typing replaces it.
- `Escape` closes and restores the input to the selected label.
- Blur (single): empty input clears the selection (fires `input` + `change`); any other unmatched text reverts to the selected label.
- Typing fires a `search` event (`detail: { query }`), not `input`. `input` / `change` stay reserved for value changes, so listeners don't confuse typing with selecting.
- Async loading: consumer listens to `search` and replaces options; selection and labels survive (see "Selection is independent of options"). `no-filter` attribute turns off built-in filtering for server-filtered results.
- Live region (`aria-live="polite"`) announces the result count after filtering ("3 options", "No results").

### Phase 7: clear and polish

- `with-clear`: reuse `ce-input`'s clear button approach (`mousedown` prevented, not in tab order, label "Clear", `clear-icon` slot, hidden when empty or disabled).
- Demo page sections for each mode, `.d.ts` files, docs.

## Corner cases

- Value set before options exist (frameworks set properties before children) → kept with `label: null`.
- Options removed or replaced while selected → selection and label kept, no event. Re-added → shown as selected again.
- Value set in code that never gets a matching option → kept, submitted, display shows the raw value.
- Option label changes while selected → stored label updates.
- Selected option disabled later → stays selected (like native).
- Highlighted option removed or disabled → highlight moves to the next enabled option, or `null`.
- Option label text changes → display text updates.
- Duplicate values: first option wins; later duplicates are unselectable. Document it.
- All options disabled, or no options: popup opens with nothing highlighted; Enter does nothing.
- Switching `multiple` off → keep only the first selected value. Switching `searchable` → rebuild trigger, keep value.
- Disabled while open (attribute or fieldset) → close.
- Several `ce-option selected` in single mode → last one wins (like native).
- `RESET` with no default-selected options → empty value and placeholder, not the first option (unlike native `<select>`). Same on first render.
- Option clicks while disabled → ignored.
- Option elements moved between two selects → each observer re-snapshots.
- Element disconnected while open → close and remove outside-click listener.
- Removing our own states / ARIA must not trigger `MutationObserver` (only internals and custom states are used, never attributes on user DOM).
- `Escape` while open inside a dialog → closes only the popup (`preventDefault` + `stopPropagation`), not the dialog.
- Focus moving into another shadow root → listen for `focusin` on the select's root node too, not just `document`.
- Form reset doesn't fire `input` / `change` (like native).

## Lessons from `wa-combobox`

Kept in mind, not copied:

- **Value hidden when options change.** `value` getter filters by options currently in the DOM (unless `allowCustomValue`), and single-mode input text keeps the old label. Result: text shown, value `null`. Fixed by our selection model.
- **Mutating user DOM.** It sets `id` on every option (for `aria-activedescendant`) and toggles `hidden` on options, group labels and dividers when filtering, then needs guards against its own slotchange loops. We use `ariaActiveDescendantElement` and custom states instead.
- **Typing fires `input` on the host**, same event as value changes. We use a separate `search` event.
- **State spread over flags** (`hasInteracted`, `valueHasChanged`, `hasInputSinceOpening`, `optionValues` cache, `selectionOrder` map) that must be kept in sync by hand. Our reducer holds one state object.
- **Adopted:** select-on-focus, Escape restores the label, blur rules for single mode, Escape `stopPropagation`, `focusin` on the root node, live region for result counts.
- **Not adopted (for now):** `allowCustomValue`, `allowCreate`, tags, `Backspace` removes last selection, opening on label click, input/change on reset.

## Out of scope

`required` / validation, option groups, virtualization, tags, custom filter functions, custom values / creating options.

## Open questions

- CSS anchor positioning support is still missing in some browsers; add a JS fallback later if needed.
