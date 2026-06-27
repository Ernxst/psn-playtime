import { describe, expect, onTestFinished, test, vi } from "vitest";
import { render } from "vitest-browser-react";
import { page } from "vitest/browser";
import {
  type ApiTransaction,
  encodeHandoff,
  HANDOFF_COMPLETE_TYPE,
  HANDOFF_MESSAGE_TYPE,
  HANDOFF_READY_TYPE,
  HANDOFF_RECEIVED_TYPE,
  HANDOFF_VERSION,
  type HandoffPayload,
  PLAYSTATION_ORIGIN,
} from "@/lib/psn/transactions";
import { clearTransactionImport, useTransactionImport } from "@/lib/transactions-store";
import { createHarness } from "@/test/harness";
import { walletFunding } from "@/test/transaction-fixtures";
import { ImportReceiver, isHandoffComplete, readHandoffMessage } from "./import";

/** A single-product purchase transaction node. */
function purchase(
  id: string,
  orderItemId: string,
  productName: string,
  total: number
): ApiTransaction {
  const display = `£${(total / 100).toFixed(2)}`;
  return {
    id,
    date: "2024-01-01T00:00:00.000Z",
    transactionType: "PRODUCT_PURCHASE",
    invoiceType: "PRODUCT_PURCHASE",
    displayOfTransactionValue: display,
    purchaseDetails: {
      productPurchases: [
        {
          productName,
          skuId: `EP0000-PPSA00000_00-SKU${id}`,
          skuType: "STANDARD",
          quantity: 1,
          total,
          totalFormatted: display,
          originalPrice: total,
          discount: 0,
          orderItemId,
        },
      ],
    },
  };
}

/** A handoff payload carrying the given raw transaction nodes. */
function batch(transactions: ApiTransaction[]): HandoffPayload {
  return {
    v: HANDOFF_VERSION,
    source: "www.playstation.com",
    fetchedAt: "2024-01-01T00:00:00.000Z",
    transactions,
  };
}

const satisfactory = purchase("700000000000010", "oi-sat", "Satisfactory", 3300);
const hades = purchase("700000000000011", "oi-hades", "Hades", 2000);
const payload = batch([satisfactory, hades]);

/** Dispatch a PlayStation-origin handoff message of the given envelope type. */
function dispatchMessage(type: string, body: object): void {
  window.dispatchEvent(
    new MessageEvent("message", { origin: PLAYSTATION_ORIGIN, data: { type, ...body } })
  );
}

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
  window.location.hash = `#${encodeHandoff(batch([]))}`;

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
      data: { type: HANDOFF_MESSAGE_TYPE, payload: { v: 99, transactions: "nope" } },
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

test("appends streamed batches live and de-dupes by row key", async () => {
  onTestFinished(cleanUp);

  const { element } = createHarness(
    <>
      <ImportReceiver />
      <Probe />
    </>
  );
  await render(element);

  dispatchMessage(HANDOFF_MESSAGE_TYPE, { payload: batch([satisfactory, walletFunding]) });

  await expect.element(page.getByText("imported:2")).toBeVisible();

  // Second batch repeats Satisfactory and adds Hades — only Hades is appended.
  dispatchMessage(HANDOFF_MESSAGE_TYPE, { payload: batch([satisfactory, hades]) });

  await expect.element(page.getByText("imported:3")).toBeVisible();
});

test("shows a running progress count as batches arrive", async () => {
  fakeOpener(vi.fn());
  onTestFinished(cleanUp);

  const { element } = createHarness(<ImportReceiver />);
  await render(element);

  await expect.element(page.getByText("0 transactions imported so far")).toBeVisible();

  dispatchMessage(HANDOFF_MESSAGE_TYPE, { payload: batch([satisfactory, walletFunding]) });

  await expect.element(page.getByText("2 transactions imported so far")).toBeVisible();
});

test("re-receiving the same batch does not duplicate rows", async () => {
  onTestFinished(cleanUp);

  const { element } = createHarness(
    <>
      <ImportReceiver />
      <Probe />
    </>
  );
  await render(element);

  dispatchMessage(HANDOFF_MESSAGE_TYPE, { payload: batch([satisfactory, hades]) });
  await expect.element(page.getByText("imported:2")).toBeVisible();

  dispatchMessage(HANDOFF_MESSAGE_TYPE, { payload: batch([satisfactory, hades]) });

  await expect.element(page.getByText("imported:2")).toBeVisible();
});

test("ignores a streamed batch whose payload fails schema validation", async () => {
  onTestFinished(cleanUp);

  const { element } = createHarness(
    <>
      <ImportReceiver />
      <Probe />
    </>
  );
  await render(element);

  await expect.element(page.getByText("imported:0")).toBeVisible();

  dispatchMessage(HANDOFF_MESSAGE_TYPE, { payload: { v: 99, transactions: "nope" } });

  await expect.element(page.getByText("imported:0")).toBeVisible();
});

describe(".isHandoffComplete", () => {
  test("is true for the complete envelope from PlayStation", () => {
    const event = new MessageEvent("message", {
      origin: PLAYSTATION_ORIGIN,
      data: { type: HANDOFF_COMPLETE_TYPE },
    });

    expect(isHandoffComplete(event)).toBe(true);
  });

  test("is false for the complete envelope from a different origin", () => {
    const event = new MessageEvent("message", {
      origin: "https://evil.example.com",
      data: { type: HANDOFF_COMPLETE_TYPE },
    });

    expect(isHandoffComplete(event)).toBe(false);
  });

  test("is false for a different envelope type", () => {
    const event = new MessageEvent("message", {
      origin: PLAYSTATION_ORIGIN,
      data: { type: HANDOFF_MESSAGE_TYPE },
    });

    expect(isHandoffComplete(event)).toBe(false);
  });
});
