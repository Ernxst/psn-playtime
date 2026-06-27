import { describe, expect, onTestFinished, test, vi } from "vitest";
import { render } from "vitest-browser-react";
import { page } from "vitest/browser";
import {
  encodeHandoff,
  HANDOFF_MESSAGE_TYPE,
  HANDOFF_READY_TYPE,
  HANDOFF_RECEIVED_TYPE,
  HANDOFF_VERSION,
  type HandoffPayload,
  PLAYSTATION_ORIGIN,
} from "@/lib/psn/transactions";
import { clearTransactionImport, useTransactionImport } from "@/lib/transactions-store";
import { createHarness } from "@/test/harness";
import { ImportReceiver, readHandoffMessage } from "./import";

const payload: HandoffPayload = {
  v: HANDOFF_VERSION,
  source: "store.playstation.com",
  scrapedAt: "2024-01-01T00:00:00.000Z",
  rows: [
    { date: "12 May 2023", amount: "-£33.00", description: "Satisfactory" },
    { date: "01/01/2024", amount: "£10.00", description: "PlayStation Store Wallet" },
  ],
};

/** Install a fake `window.opener` exposing a `postMessage` spy for the test. */
function fakeOpener(postMessage: ReturnType<typeof vi.fn>) {
  const original = Object.getOwnPropertyDescriptor(window, "opener");
  Object.defineProperty(window, "opener", { value: { postMessage }, configurable: true });
  onTestFinished(() => {
    if (original) Object.defineProperty(window, "opener", original);
    else Reflect.deleteProperty(window, "opener");
  });
}

/** Surfaces the persisted import count so the effect's write can be awaited. */
function Probe() {
  const imported = useTransactionImport();
  return <div>imported:{imported?.transactions.length ?? 0}</div>;
}

function cleanUp() {
  clearTransactionImport();
  window.location.hash = "";
}

test("persists the transactions handed over in the URL fragment", async () => {
  onTestFinished(cleanUp);
  window.location.hash = `#${encodeHandoff(payload)}`;

  const { element } = createHarness(
    <>
      <ImportReceiver />
      <Probe />
    </>
  );
  await render(element);

  await expect.element(page.getByText("imported:2")).toBeVisible();
});

test("shows the empty state when there is no fragment data", async () => {
  onTestFinished(cleanUp);
  window.location.hash = "";

  const { element } = createHarness(<ImportReceiver />);
  await render(element);

  await expect.element(page.getByText("Nothing to import")).toBeVisible();
  await expect.element(page.getByText(/no import data in the link/)).toBeVisible();
});

test("shows the invalid state when no transactions can be parsed", async () => {
  onTestFinished(cleanUp);
  window.location.hash = `#${encodeHandoff({
    ...payload,
    rows: [{ date: "x", amount: "Free", description: "Demo" }],
  })}`;

  const { element } = createHarness(<ImportReceiver />);
  await render(element);

  await expect.element(page.getByText("Nothing to import")).toBeVisible();
  await expect.element(page.getByText(/couldn't read any transactions/)).toBeVisible();
});

describe(".readHandoffMessage", () => {
  function message(init: MessageEventInit): MessageEvent {
    return new MessageEvent("message", init);
  }

  test("returns the payload for a valid PlayStation message", () => {
    const event = message({
      origin: PLAYSTATION_ORIGIN,
      data: { type: HANDOFF_MESSAGE_TYPE, payload },
    });

    expect(readHandoffMessage(event)).toEqual(payload);
  });

  test("ignores a message from a different origin", () => {
    const event = message({
      origin: "https://evil.example.com",
      data: { type: HANDOFF_MESSAGE_TYPE, payload },
    });

    expect(readHandoffMessage(event)).toBeNull();
  });

  test("ignores a message with the wrong type", () => {
    const event = message({
      origin: PLAYSTATION_ORIGIN,
      data: { type: "something-else", payload },
    });

    expect(readHandoffMessage(event)).toBeNull();
  });

  test("ignores a message whose payload fails validation", () => {
    const event = message({
      origin: PLAYSTATION_ORIGIN,
      data: { type: HANDOFF_MESSAGE_TYPE, payload: { v: 99, rows: "nope" } },
    });

    expect(readHandoffMessage(event)).toBeNull();
  });
});

test("persists transactions handed over via postMessage and acks the opener", async () => {
  const openerPost = vi.fn();
  fakeOpener(openerPost);
  onTestFinished(cleanUp);

  const { element } = createHarness(
    <>
      <ImportReceiver />
      <Probe />
    </>
  );
  await render(element);

  window.dispatchEvent(
    new MessageEvent("message", {
      origin: PLAYSTATION_ORIGIN,
      data: { type: HANDOFF_MESSAGE_TYPE, payload },
    })
  );

  await expect.element(page.getByText("imported:2")).toBeVisible();

  expect(openerPost).toHaveBeenCalledTimes(2);
  expect(openerPost).toHaveBeenNthCalledWith(1, { type: HANDOFF_READY_TYPE }, "*");
  expect(openerPost).toHaveBeenNthCalledWith(
    2,
    { type: HANDOFF_RECEIVED_TYPE },
    PLAYSTATION_ORIGIN
  );
});

test("ignores a postMessage from a non-PlayStation origin", async () => {
  const openerPost = vi.fn();
  fakeOpener(openerPost);
  onTestFinished(cleanUp);

  const { element } = createHarness(
    <>
      <ImportReceiver />
      <Probe />
    </>
  );
  await render(element);

  await expect.element(page.getByText("imported:0")).toBeVisible();

  window.dispatchEvent(
    new MessageEvent("message", {
      origin: "https://evil.example.com",
      data: { type: HANDOFF_MESSAGE_TYPE, payload },
    })
  );

  await expect.element(page.getByText("imported:0")).toBeVisible();
  expect(openerPost).toHaveBeenCalledExactlyOnceWith({ type: HANDOFF_READY_TYPE }, "*");
});
