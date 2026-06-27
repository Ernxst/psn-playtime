import { afterEach, describe, expect, it, onTestFinished, vi } from "vitest";
import {
  dumpScrollDiagnostics,
  findScrollableAncestor,
  resolveScrollContainer,
} from "./transaction-bookmarklet";

describe(".findScrollableAncestor", () => {
  it("returns the nearest ancestor whose overflow-y scrolls real overflow", () => {
    const scroller = document.createElement("div");
    scroller.style.cssText = "height:50px;overflow-y:auto";
    const tall = document.createElement("div");
    tall.style.height = "500px";
    const start = document.createElement("span");
    tall.append(start);
    scroller.append(tall);
    document.body.append(scroller);
    onTestFinished(() => scroller.remove());

    expect(findScrollableAncestor(start)).toBe(scroller);
  });

  it("skips an ancestor with overflow-y but no real overflow", () => {
    const outer = document.createElement("div");
    outer.style.cssText = "height:50px;overflow-y:auto";
    const tall = document.createElement("div");
    tall.style.height = "500px";
    const fits = document.createElement("div");
    fits.style.cssText = "overflow-y:auto";
    const start = document.createElement("span");
    fits.append(start);
    tall.append(fits);
    outer.append(tall);
    document.body.append(outer);
    onTestFinished(() => outer.remove());

    expect(findScrollableAncestor(start)).toBe(outer);
  });

  it("returns null when no ancestor is scrollable", () => {
    const wrap = document.createElement("div");
    const start = document.createElement("span");
    wrap.append(start);
    document.body.append(wrap);
    onTestFinished(() => wrap.remove());

    expect(findScrollableAncestor(start)).toBeNull();
  });

  it("returns null when given no element", () => {
    expect(findScrollableAncestor(null)).toBeNull();
  });
});

describe(".resolveScrollContainer", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  const buildPanel = (wrapperClass: string) => {
    const wrapper = document.createElement("div");
    wrapper.className = wrapperClass;
    wrapper.style.cssText = "height:50px;overflow-y:auto";
    const tall = document.createElement("div");
    tall.style.height = "500px";
    const screen = document.createElement("div");
    screen.className = "transaction-history-screen";
    const cards = document.createElement("div");
    cards.className = "transaction-history-screen-cards";
    screen.append(cards);
    tall.append(screen);
    wrapper.append(tall);
    document.body.append(wrapper);
    onTestFinished(() => wrapper.remove());
    return { wrapper, cards };
  };

  it("resolves the outer workstream wrapper when it scrolls real overflow", () => {
    const { wrapper } = buildPanel("transaction-history-workstream-wrapper");

    expect(resolveScrollContainer(document)).toBe(wrapper);
  });

  it("resolves the inner workstream when the wrapper is absent", () => {
    const { wrapper } = buildPanel("transaction-history-workstream");

    expect(resolveScrollContainer(document)).toBe(wrapper);
  });

  it("falls back to a scrollable ancestor of the cards container when no workstream scrolls", () => {
    const scroller = document.createElement("div");
    scroller.style.cssText = "height:50px;overflow-y:auto";
    const tall = document.createElement("div");
    tall.style.height = "500px";
    const cards = document.createElement("div");
    cards.className = "transaction-history-screen-cards";
    tall.append(cards);
    scroller.append(tall);
    document.body.append(scroller);
    onTestFinished(() => scroller.remove());

    expect(resolveScrollContainer(document)).toBe(scroller);
  });

  it("ignores a workstream wrapper that has no real overflow", () => {
    const wrapper = document.createElement("div");
    wrapper.className = "transaction-history-workstream-wrapper";
    wrapper.style.cssText = "height:500px;overflow-y:auto";
    const cards = document.createElement("div");
    cards.className = "transaction-history-screen-cards";
    wrapper.append(cards);
    document.body.append(wrapper);
    onTestFinished(() => wrapper.remove());

    expect(resolveScrollContainer(document)).toBeNull();
  });

  it("returns null when nothing scrolls", () => {
    const wrapper = document.createElement("div");
    const cards = document.createElement("div");
    cards.className = "transaction-history-screen-cards";
    wrapper.append(cards);
    document.body.append(wrapper);
    onTestFinished(() => wrapper.remove());

    expect(resolveScrollContainer(document)).toBeNull();
  });

  it("warns when no scrollable container is found", () => {
    const warn = vi.spyOn(console, "warn").mockReturnValue();
    const wrapper = document.createElement("div");
    const cards = document.createElement("div");
    cards.className = "transaction-history-screen-cards";
    wrapper.append(cards);
    document.body.append(wrapper);
    onTestFinished(() => wrapper.remove());

    resolveScrollContainer(document);

    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining("[psn-import] no scrollable container found")
    );
  });
});

describe(".dumpScrollDiagnostics", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("warns with a candidate dump covering each selector and the document scrollers", () => {
    const warn = vi.spyOn(console, "warn").mockReturnValue();
    const cards = document.createElement("div");
    cards.className = "transaction-history-screen-cards";
    document.body.append(cards);
    onTestFinished(() => cards.remove());

    dumpScrollDiagnostics(document);

    expect(warn).toHaveBeenCalledWith("[psn-import] scroll diagnostics — candidate dump:");
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining(".transaction-history-workstream-wrapper")
    );
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("document.scrollingElement"));
  });
});
