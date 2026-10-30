// Temporary probe: does a removed ce-input get garbage collected, given that
// setupFieldLabel never removes its slotchange / click listeners?
import { expect, it } from "vite-plus/test";
import { cdp } from "vite-plus/test/browser/context";
import "./ce-input/ce-input.ts";
import { query, queryShadow } from "./core/test-dom.ts";

async function collectGarbage() {
  for (let i = 0; i < 5; i++) {
    await cdp().send("HeapProfiler.collectGarbage");
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

/**
 * Renders a ce-input, interacts with it so the listeners have run, removes it
 * and returns only weak references.
 * @param extra Extra setup, e.g. a leaking listener.
 */
function renderAndRemove(extra?: (host: HTMLElement) => void) {
  const container = document.createElement("div");
  container.innerHTML = `<ce-input name="first" label="First name"><span slot="label">Slotted</span></ce-input>`;
  document.body.append(container);

  const host = query(container, "ce-input");
  const label = queryShadow<HTMLLabelElement>(host, "[part='label']");
  const slot = query(label, "slot");

  // Make sure both listeners have actually fired.
  label.click();
  query(host, "span").remove();

  extra?.(host);

  container.remove();

  return {
    host: new WeakRef(host),
    label: new WeakRef(label),
    slot: new WeakRef(slot),
  };
}

it("collects a removed ce-input with its label listeners", async () => {
  const refs = renderAndRemove();

  // Let slotchange fire before collecting.
  await new Promise((resolve) => setTimeout(resolve, 50));
  await collectGarbage();

  expect(refs.host.deref()).toBe(undefined);
  expect(refs.label.deref()).toBe(undefined);
  expect(refs.slot.deref()).toBe(undefined);
});

type Cleanup = {
  remove?: () => void;
};

it("control: a document listener holding the host keeps it alive", async () => {
  // Only the listener may hold the host, so keep just a way to remove it.
  const cleanup: Cleanup = {};

  const refs = renderAndRemove((host) => {
    const listener = () => {
      host.focus();
    };

    document.addEventListener("click", listener);

    cleanup.remove = () => {
      document.removeEventListener("click", listener);
    };
  });

  await new Promise((resolve) => setTimeout(resolve, 50));
  await collectGarbage();

  expect(refs.host.deref()).not.toBe(undefined);

  // Removing the listener frees it.
  cleanup.remove?.();
  delete cleanup.remove;
  await collectGarbage();

  expect(refs.host.deref()).toBe(undefined);
});
