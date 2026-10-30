import { getIcon, unwatchIconLibraries, watchIconLibraries } from "./icon-library.js";

const styles = new CSSStyleSheet();
styles.replaceSync(`
  :host { display: inline-block; width: 1em; height: 1em; vertical-align: -0.125em; }
  svg { display: block; width: 100%; height: 100%; }
`);

export class CeIcon extends HTMLElement {
  static observedAttributes = ["name", "library", "label"];

  #initialized = false;

  /** @type {ShadowRoot | null} */
  #root = null;

  /** @type {ElementInternals} */
  #internals;

  constructor() {
    super();
    this.#internals = this.attachInternals();
  }

  get name() {
    return this.getAttribute("name") ?? "";
  }

  set name(value) {
    this.setAttribute("name", value);
  }

  get library() {
    return this.getAttribute("library") ?? "default";
  }

  set library(value) {
    this.setAttribute("library", value);
  }

  get label() {
    return this.getAttribute("label") ?? "";
  }

  set label(value) {
    this.setAttribute("label", value);
  }

  connectedCallback() {
    if (!this.#initialized) {
      this.#setup();
      this.#initialized = true;
    }

    watchIconLibraries(this.#onLibraryRegistered);

    this.#updateIcon();
    this.#updateLabel();
  }

  disconnectedCallback() {
    unwatchIconLibraries(this.#onLibraryRegistered);
  }

  /**
   * @param {string} name
   * @param {string | null} oldValue
   * @param {string | null} newValue
   */
  attributeChangedCallback(name, oldValue, newValue) {
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

  /** @param {string} library */
  #onLibraryRegistered = (library) => {
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

if (!customElements.get("ce-icon")) {
  customElements.define("ce-icon", CeIcon);
}
