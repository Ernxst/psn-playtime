import { describe, expect, it } from "vitest";
import { render } from "vitest-browser-react";

function expectElement(element: HTMLElement | null): asserts element is HTMLElement {
  expect(element).toBeInstanceOf(HTMLElement);
}

/**
 * Proof that the browser project loads the app's compiled Tailwind CSS (via the
 * `load-styles` setup file). Without that stylesheet these utility classes are
 * inert, so `display` falls back to `block` and `w-full` measures nothing — both
 * assertions fail. With it, the classes resolve and computed layout is real.
 */
describe("Tailwind CSS in the browser project", () => {
  it("resolves a flex utility to a real computed display", async () => {
    const { container } = await render(<div className="flex" data-testid="flex" />);

    // This test verifies emitted CSS against a deliberately non-semantic fixture.
    // oxlint-disable-next-line test-contract/no-dom-selector
    const element = container.querySelector<HTMLElement>('[data-testid="flex"]');

    expectElement(element);

    expect(getComputedStyle(element).display).toBe("flex");
  });

  it("resolves max-w-* so a w-full child is capped below its container width", async () => {
    const { container } = await render(
      <div style={{ width: "320px" }}>
        <div className="w-full max-w-40" data-testid="capped" />
      </div>
    );

    // This test verifies emitted CSS against a deliberately non-semantic fixture.
    // oxlint-disable-next-line test-contract/no-dom-selector
    const element = container.querySelector<HTMLElement>('[data-testid="capped"]');

    expectElement(element);

    // `max-w-40` is 10rem (160px). Without the stylesheet the class is inert and
    // the block child would stretch to the full 320px container instead.
    expect(element.getBoundingClientRect().width).toBe(160);
  });
});
