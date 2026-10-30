// Temporary probe: does a removed ce-input get garbage collected, given that
// FieldLabel never removes its slotchange / click listeners?
import { expect, it } from "vite-plus/test";
import { cdp } from "vite-plus/test/browser/context";
import "./ce-input/ce-input.js";

async function collectGarbage() {
  for (let i = 0; i < 5; i++) {
    await cdp().send("HeapProfiler.collectGarbage");
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

/**
 * Renders a ce-input, interacts with it so the listeners have run, removes it
 * and returns only weak references.
 * @param {(host: HTMLElement) => void} [extra] Extra setup, e.g. a leaking listener.
 */
function renderAndRemove(extra) {
  const container = document.createElement("div");
  container.innerHTML = `<ce-input name="first" label="First name"><span slot="label">Slotted</span></ce-input>`;
  document.body.append(container);

  const host = container.querySelector("ce-input");
  const label = host.shadowRoot.querySelector("[part='label']");
  const slot = label.querySelector("slot");

  // Make sure both listeners have actually fired.
  label.click();
  host.querySelector("span").remove();

  extra?.(host);

  container.remove();

  return {
    host: new WeakRef(host),
    label: new WeakRef(label),
    slot: new WeakRef(slot),
  };
}

it("collects a removed ce-input with its FieldLabel listeners", async () => {
  const refs = renderAndRemove();

  // Let slotchange fire before collecting.
  await new Promise((resolve) => setTimeout(resolve, 50));
  await collectGarbage();

  expect(refs.host.deref()).toBe(undefined);
  expect(refs.label.deref()).toBe(undefined);
  expect(refs.slot.deref()).toBe(undefined);
});

it("control: a document listener holding the host keeps it alive", async () => {
  /** @type {(() => void) | null} */
  let listener = null;

  const refs = renderAndRemove((host) => {
    listener = () => {
      host.focus();
    };
    document.addEventListener("click", listener);
  });

  await new Promise((resolve) => setTimeout(resolve, 50));
  await collectGarbage();

  expect(refs.host.deref()).not.toBe(undefined);

  // Removing the listener frees it.
  document.removeEventListener("click", listener);
  listener = null;
  await collectGarbage();

  expect(refs.host.deref()).toBe(undefined);
});
