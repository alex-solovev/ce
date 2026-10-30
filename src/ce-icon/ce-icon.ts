import { defineElement } from "../core/dom.ts";
import { getIcon, unwatchIconLibraries, watchIconLibraries } from "./icon-library.ts";

const styles = new CSSStyleSheet();
styles.replaceSync(`
  :host { display: inline-block; width: 1em; height: 1em; vertical-align: -0.125em; }
  svg { display: block; width: 100%; height: 100%; }
`);

/**
 * An SVG icon from a registered icon library.
 *
 * @attr name - Icon name within the library.
 * @attr library - Library name. Defaults to "default".
 * @attr label - Accessible label. Without one the icon is decorative.
 * @csspart svg - The rendered SVG.
 */
export class CeIcon extends HTMLElement {
  static observedAttributes: string[] = ["name", "library", "label"];

  #initialized = false;

  #root: ShadowRoot | null = null;

  #internals: ElementInternals;

  constructor() {
    super();
    this.#internals = this.attachInternals();
  }

  /** Reflects the `name` attribute. */
  get name(): string {
    return this.getAttribute("name") ?? "";
  }

  set name(value: string) {
    this.setAttribute("name", value);
  }

  /** Reflects the `library` attribute. */
  get library(): string {
    return this.getAttribute("library") ?? "default";
  }

  set library(value: string) {
    this.setAttribute("library", value);
  }

  /** Reflects the `label` attribute. */
  get label(): string {
    return this.getAttribute("label") ?? "";
  }

  set label(value: string) {
    this.setAttribute("label", value);
  }

  connectedCallback(): void {
    if (!this.#initialized) {
      this.#setup();
      this.#initialized = true;
    }

    watchIconLibraries(this.#onLibraryRegistered);

    this.#updateIcon();
    this.#updateLabel();
  }

  disconnectedCallback(): void {
    unwatchIconLibraries(this.#onLibraryRegistered);
  }

  attributeChangedCallback(name: string, oldValue: string | null, newValue: string | null): void {
    if (!this.#initialized) {
      return;
    }

    if (oldValue === newValue) {
      return;
    }

    if (name === "name" || name === "library") {
      this.#updateIcon();
      return;
    }

    if (name === "label") {
      this.#updateLabel();
      return;
    }
  }

  #setup() {
    this.#root = this.attachShadow({ mode: "open" });
    this.#root.adoptedStyleSheets = [styles];
  }

  #onLibraryRegistered = (library: string) => {
    if (library !== this.library) {
      return;
    }

    this.#updateIcon();
  };

  #updateIcon() {
    if (!this.#root) {
      return;
    }

    const markup = getIcon(this.library, this.name);

    if (!markup) {
      this.#root.replaceChildren();
      return;
    }

    const template = document.createElement("template");
    template.innerHTML = markup;

    const svg = template.content.firstElementChild;

    if (!(svg instanceof SVGSVGElement)) {
      this.#root.replaceChildren();
      return;
    }

    svg.part.add("svg");

    // The host carries the semantics; the SVG would otherwise show up as a second image.
    svg.setAttribute("aria-hidden", "true");

    this.#root.replaceChildren(svg);
  }

  // Without a label the icon is decorative and hidden from assistive technology.
  #updateLabel() {
    const label = this.label;

    if (!label) {
      this.#internals.role = null;
      this.#internals.ariaLabel = null;
      this.#internals.ariaHidden = "true";
      return;
    }

    this.#internals.role = "img";
    this.#internals.ariaLabel = label;
    this.#internals.ariaHidden = null;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "ce-icon": CeIcon;
  }
}

defineElement("ce-icon", CeIcon);
