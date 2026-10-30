// Small DOM helpers shared by components.

/** A class an element can be checked against with `instanceof`. */
export type ElementType<T extends Element> = abstract new (...args: never[]) => T;

/**
 * Finds an element that must exist, such as a part of a component's own
 * template. Throws if it's missing or of the wrong type.
 */
export function requireElement<T extends Element>(
  root: ParentNode,
  selector: string,
  type: ElementType<T>,
): T {
  const element = root.querySelector(selector);

  if (!(element instanceof type)) {
    throw new Error(`Expected a ${type.name} matching "${selector}"`);
  }

  return element;
}

/**
 * Text of the light-DOM content that goes into a slot of `host`, with
 * whitespace collapsed. Read from the light DOM, so it works before the
 * shadow root exists.
 *
 * @param slot Slot name; "" for the default slot.
 */
export function slottedText(host: Element, slot = ""): string {
  let text = "";

  for (const node of host.childNodes) {
    if (node instanceof Element) {
      if (node.slot !== slot) {
        continue;
      }

      // Default slot content is inline ("Green <b>pear</b>"); elements in a
      // named slot are separate pieces, so keep them apart.
      text += slot === "" ? (node.textContent ?? "") : ` ${node.textContent ?? ""}`;
      continue;
    }

    // Text nodes only go to the default slot. Comments never count.
    if (slot === "" && node instanceof Text) {
      text += node.data;
    }
  }

  return text.replace(/\s+/g, " ").trim();
}

/** Adds or removes a custom state, for `:state(name)` selectors. */
export function setState(internals: ElementInternals, name: string, on: boolean): void {
  if (on) {
    internals.states.add(name);
    return;
  }

  internals.states.delete(name);
}

/** Registers a custom element unless the tag is already taken. */
export function defineElement(tag: string, constructor: CustomElementConstructor): void {
  if (customElements.get(tag)) {
    return;
  }

  customElements.define(tag, constructor);
}
