/** `<label part="label">` with a `label` slot, to put in a form control's shadow root. */
export declare const labelMarkup: string;

/** Styles for `labelMarkup`. */
export declare const labelStyles: string;

/**
 * Adds the label's listeners: clicking it focuses `control`, and slot changes
 * update it. Call once, after `labelMarkup` is in `root`.
 */
export declare function setupFieldLabel(
  host: HTMLElement,
  root: ShadowRoot,
  control: HTMLElement,
): void;

/**
 * Shows the host's `label` attribute or `label` slot and names `control` by
 * it. Call on connect and when the `label` attribute changes.
 */
export declare function updateFieldLabel(
  host: HTMLElement,
  root: ShadowRoot,
  control: HTMLElement,
): void;
