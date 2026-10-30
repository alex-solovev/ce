// Label shown above a form control, from the host's `label` attribute or
// `label` slot. Lives in the same shadow root as the control, so it can name
// it directly. External `<label>` elements aren't supported.

/** `<label part="label">` with a `label` slot, to put in a form control's shadow root. */
export const labelMarkup: string = `<label part="label" hidden><slot name="label"></slot></label>`;

/** Styles for `labelMarkup`. */
export const labelStyles: string = `
  [part="label"] { display: block; margin-block-end: 0.25em; }
  [part="label"][hidden] { display: none; }
`;

/**
 * Adds the label's listeners: clicking it focuses `control`, and slot changes
 * update it. Call once, after `labelMarkup` is in `root`.
 *
 * @param control The focusable element to name.
 */
export function setupFieldLabel(host: HTMLElement, root: ShadowRoot, control: HTMLElement): void {
  const { label, slot } = findLabel(root);

  slot.addEventListener("slotchange", () => {
    updateFieldLabel(host, root, control);
  });

  label.addEventListener("click", () => {
    control.focus();
  });
}

/**
 * Shows the host's `label` attribute or slotted content, and names the
 * control by it. Call on connect and when the `label` attribute changes.
 */
export function updateFieldLabel(host: HTMLElement, root: ShadowRoot, control: HTMLElement): void {
  const { label, slot } = findLabel(root);
  const text = host.getAttribute("label") ?? "";

  // Fallback content: shown only when nothing is slotted. Only write on
  // change: replacing it fires slotchange, which calls this again.
  if (slot.textContent !== text) {
    slot.textContent = text;
  }

  const hasSlotted = slot.assignedNodes().length > 0;
  const hasLabel = hasSlotted || text !== "";

  label.hidden = !hasLabel;

  // Without a label, leave naming to aria-label or the placeholder.
  if (!hasLabel) {
    control.ariaLabelledByElements = null;
    return;
  }

  control.ariaLabelledByElements = [label];
}

function findLabel(root: ShadowRoot): { label: HTMLLabelElement; slot: HTMLSlotElement } {
  const label = root.querySelector("label[part='label']");
  const slot = label?.querySelector("slot[name='label']");

  if (!(label instanceof HTMLLabelElement) || !(slot instanceof HTMLSlotElement)) {
    throw new Error("Shadow root has no labelMarkup");
  }

  return { label, slot };
}
