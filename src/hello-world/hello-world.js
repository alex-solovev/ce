const template = document.createElement("template");
template.innerHTML = `
  <style>
    :host { display: inline-block; font: inherit; }
  </style>
  <span part="greeting"></span>
`;

export class HelloWorld extends HTMLElement {
  static observedAttributes = ["name"];

  #initialized = false;

  /** @type {HTMLSpanElement | null} */
  #greeting = null;

  get name() {
    return this.getAttribute("name") ?? "World";
  }

  set name(value) {
    // attributeChangedCallback reacts; don't call the handler here
    this.setAttribute("name", value);
  }

  connectedCallback() {
    if (!this.#initialized) {
      this.#setup();
      this.#initialized = true;
    }

    this.#updateGreeting();
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

if (!customElements.get("hello-world")) {
  customElements.define("hello-world", HelloWorld);
}
