# Component conventions

Every component follows the same shape so deviations stand out in review.

## 1. Single source of truth

- Component state lives in one place (attributes for public state, private fields for internal state).
- Every update function reads from that source. **Never read state back out of the DOM.**
- Back this with a test: after a sequence of interactions, DOM and internal state agree.

## 2. Property routes through the attribute

`attributeChangedCallback` only fires on attribute mutations, not property assignment. Route the setter through the attribute so both paths (`el.disabled = true` and `<my-el disabled>`) end up in one handler, with no double-firing.

```js
static observedAttributes = ["disabled"];

get disabled() {
  return this.hasAttribute("disabled");
}

set disabled(value) {
  // attributeChangedCallback reacts; don't call the handler here
  this.toggleAttribute("disabled", Boolean(value));
}
```

## 3. Init guard

`attributeChangedCallback` can fire for parse-time attributes before `connectedCallback` has set up shadow DOM or `ElementInternals`. Guard it (the equivalent of Lit's `waitUntilFirstUpdate`), and apply current state once setup is done.

```js
#initialized = false;

connectedCallback() {
  if (!this.#initialized) {
    this.#setup(); // shadow DOM, listeners
    this.#initialized = true;
  }

  this.#updateDisabled();
}

attributeChangedCallback(name, oldValue, newValue) {
  if (!this.#initialized) {
    return;
  }

  if (oldValue === newValue) {
    return;
  }

  if (name === "disabled") {
    this.#updateDisabled();
    return;
  }
}
```

## 4. Small imperative update functions

One function per concern (`#updateDisabled`, `#moveHighlight`). Each is independently testable with synchronous assertions.

## 5. Observer and listener teardown

Anything started in `connectedCallback` (observers, global listeners) is torn down in `disconnectedCallback`.

## 6. Platform APIs over custom machinery

Prefer `ElementInternals` (forms, ARIA, `states` for `:state(...)` CSS) and `MutationObserver` over hand-rolled equivalents.

## 7. Labels

Form controls are labelled by their own `label` attribute or `label` slot (`setupFieldLabel` / `updateFieldLabel` in `src/core/field-label.ts`), never by external `<label for>` or a wrapping `<label>`. An external label names the host, not the focusable element inside the shadow DOM, so screen readers would announce an unnamed control while clicking the label still appears to work.

## 8. Code style

Procedural and spacious: more lines are fine if each step reads on its own.

- **Early returns instead of `else` / `else if` chains.** Handle the exceptional case and return, then do the main thing.
- **Simple conditions.** Short combinations like `!this.#initialized || oldValue === newValue` are fine; split an `if` when its condition gets hard to read at a glance or a part needs its own comment.
- **Always use braces**, even for one-line bodies.
- **Blank lines between logical steps.**
- **Plain loops instead of array methods** (`find`, `map`, `filter`, `some`…) where possible.
- **Don't extract single-use helpers** that only wrap a loop or a couple of lines; inline them.
- **Function helpers over classes.** Shared behaviour goes in plain functions that take what they need (`setupFieldLabel(host, root, control)`). Use a class only when it's needed, e.g. custom elements themselves or a base class like `FormControl`.

```js
export function submitImplicitly(control) {
  const form = control.form;

  if (!form) {
    return;
  }

  for (const element of form.elements) {
    if (!isSubmitButton(element)) {
      continue;
    }

    if (element.matches(":disabled")) {
      return;
    }

    element.click();
    return;
  }

  form.requestSubmit();
}
```
