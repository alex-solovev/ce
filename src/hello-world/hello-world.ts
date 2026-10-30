const template = document.createElement("template");
template.innerHTML = `
  <style>
    :host { display: inline-block; font: inherit; }
  </style>
  <span part="greeting"></span>
`;

/**
 * Renders a greeting.
 *
 * @attr name - Who to greet. Defaults to "World".
 * @csspart greeting - The greeting text.
 */
export class HelloWorld extends HTMLElement {
  static observedAttributes: string[] = ["name"];

  #initialized = false;

  #greeting: HTMLSpanElement | null = null;

  /** Reflects the `name` attribute. */
  get name(): string {
    return this.getAttribute("name") ?? "World";
  }

  set name(value: string) {
    // attributeChangedCallback reacts; don't call the handler here
    this.setAttribute("name", value);
  }

  connectedCallback(): void {
    if (!this.#initialized) {
      this.#setup();
      this.#initialized = true;
    }

    this.#updateGreeting();
  }

  attributeChangedCallback(name: string, oldValue: string | null, newValue: string | null): void {
    if (!this.#initialized) {
      return;
    }

    if (oldValue === newValue) {
      return;
    }

    if (name === "name") {
      this.#updateGreeting();
      return;
    }
  }

  #setup() {
    const root = this.attachShadow({ mode: "open" });
    root.append(template.content.cloneNode(true));

    this.#greeting = root.querySelector("span");
  }

  #updateGreeting() {
    if (!this.#greeting) {
      return;
    }

    this.#greeting.textContent = `Hello, ${this.name}!`;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "hello-world": HelloWorld;
  }
}

if (!customElements.get("hello-world")) {
  customElements.define("hello-world", HelloWorld);
}
