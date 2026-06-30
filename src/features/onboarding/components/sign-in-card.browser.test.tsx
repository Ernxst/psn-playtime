import { describe, expect, it, onTestFinished, vi } from "vitest";
import { render } from "vitest-browser-react";
import { page } from "vitest/browser";
import { Toaster } from "@/components/ui/sonner";
import { demoDashboard } from "@/domain/mock";
import { signInWithToken } from "@/server/api/account.effect";
import { testDashboardStore } from "@/test/atom-registry";
import { createHarness } from "@/test/harness";
import { SignInCard } from "./sign-in-card";

vi.mock("@/server/api/account.effect", () => ({
  signInWithToken: vi.fn(),
}));

const ACTIVE_KEY = "psn-playtime:dashboard-active";

/** Decode the active-account pointer the dashboard kvs atom persists (JSON-encoded). */
function readActiveId(): string | null {
  const raw = localStorage.getItem(ACTIVE_KEY);
  if (raw === null) return null;
  const decoded: unknown = JSON.parse(raw);
  return typeof decoded === "string" ? decoded : null;
}

describe("SignInCard", () => {
  it("renders the connect-account card with the manual steps", async () => {
    const { element } = createHarness(<SignInCard />);

    await render(element);

    await expect.element(page.getByText("Connect your account")).toBeVisible();
    await expect
      .element(page.getByRole("link", { name: /open the ssocookie page/i }))
      .toBeVisible();
    await expect.element(page.getByRole("link", { name: /explore the demo/i })).toBeVisible();
  });

  it("styles the external links with a persistent underline so they read as links, not body text", async () => {
    const { element } = createHarness(<SignInCard />);

    await render(element);

    const link = page.getByRole("link", { name: /open the ssocookie page/i });

    await expect.element(link).toHaveClass(/underline/);
  });

  it("gives the risk disclosure a chevron affordance wired to rotate when the details open", async () => {
    const { element } = createHarness(<SignInCard />);

    await render(element);

    const summary = page.getByText("Learn about the risk");
    const chevron = summary.element().querySelector("svg.lucide-chevron-down");

    expect(chevron).toHaveClass("group-open:rotate-180");
  });

  it("opens the risk disclosure when its summary is activated", async () => {
    const { element } = createHarness(<SignInCard />);

    await render(element);

    const summary = page.getByText("Learn about the risk");
    const details = summary.element().closest("details");

    expect(details).not.toHaveAttribute("open");

    await summary.click();

    expect(details).toHaveAttribute("open");
  });

  it("keeps the risk details, including the password-grade warning, hidden until the learn-more action is opened", async () => {
    const { element } = createHarness(<SignInCard />);

    await render(element);

    await expect.element(page.getByText("Learn about the risk")).toBeVisible();
    await expect
      .element(page.getByText(/full access to your PlayStation account/i))
      .not.toBeVisible();
    await expect.element(page.getByText(/It is read-only/i)).not.toBeVisible();
    await expect.element(page.getByText(/never logged or stored/i)).not.toBeVisible();
  });

  it("opening the learn-more action reveals the password-grade warning, read-only, storage, open-source and self-host detail", async () => {
    const { element } = createHarness(<SignInCard />);

    await render(element);

    await page.getByText("Learn about the risk").click();

    await expect.element(page.getByText(/full access to your PlayStation account/i)).toBeVisible();
    await expect.element(page.getByText(/Never share it/i)).toBeVisible();
    await expect.element(page.getByText(/do not enter your token/i)).toBeVisible();
    await expect.element(page.getByText(/It is read-only/i)).toBeVisible();
    await expect
      .element(page.getByText(/sent to the server only to load your data once, then discarded/i))
      .toBeVisible();
    await expect.element(page.getByText(/self-host your own instance/i)).toBeVisible();
    await expect.element(page.getByText(/expires after about 2 months/i)).toBeVisible();

    const repoLink = page.getByRole("link", { name: /open source/i });
    await expect
      .element(repoLink)
      .toHaveAttribute("href", "https://github.com/Ernxst/psn-playtime");
  });

  it("disables sign-in until the risk is acknowledged", async () => {
    const { element } = createHarness(<SignInCard />);

    await render(element);

    await expect.element(page.getByRole("button", { name: "Sign in" })).toBeDisabled();

    await page.getByText(/sign in to my PlayStation account/i).click();

    await expect.element(page.getByRole("button", { name: "Sign in" })).toBeEnabled();
  });

  it("does not request sign-in while the risk is unacknowledged", async () => {
    const { element } = createHarness(<SignInCard />);

    await render(element);

    await page.getByLabelText("npsso token").fill("a-valid-looking-token");

    await expect.element(page.getByRole("button", { name: "Sign in" })).toBeDisabled();
    expect(signInWithToken).not.toHaveBeenCalled();
  });

  it("submitting an empty token after acknowledging shows a validation toast and skips the request", async () => {
    const { element } = createHarness(
      <>
        <SignInCard />
        <Toaster />
      </>
    );

    await render(element);

    await page.getByText(/sign in to my PlayStation account/i).click();
    await page.getByRole("button", { name: "Sign in" }).click();

    await expect.element(page.getByText("Paste your npsso token first.")).toBeVisible();
    expect(signInWithToken).not.toHaveBeenCalled();
  });

  it("submitting a token after acknowledging caches the fetched account and makes it active", async () => {
    onTestFinished(() => localStorage.clear());
    const account = {
      ...demoDashboard,
      isDemo: false,
      profile: { ...demoDashboard.profile, accountId: "acc-1", onlineId: "Ernxst_" },
    };
    vi.mocked(signInWithToken).mockResolvedValue(account);
    const { element } = createHarness(<SignInCard />);

    await render(element);

    await page.getByLabelText("npsso token").fill("a-valid-looking-token");
    await page.getByText(/sign in to my PlayStation account/i).click();
    await page.getByRole("button", { name: "Sign in" }).click();

    expect(signInWithToken).toHaveBeenCalledExactlyOnceWith({
      data: { npsso: "a-valid-looking-token" },
    });
    await expect.poll(() => testDashboardStore.load("acc-1")).toEqual(account);
    await expect.poll(readActiveId).toBe("acc-1");
  });

  it("lists a cached account so a revisit needs no token", async () => {
    onTestFinished(() => localStorage.clear());
    testDashboardStore.save({
      ...demoDashboard,
      isDemo: false,
      profile: { ...demoDashboard.profile, accountId: "acc-1", onlineId: "Ernxst_" },
    });
    const { element } = createHarness(<SignInCard />);

    await render(element);

    await page.getByRole("button", { name: /Continue as Ernxst_/ }).click();

    await expect.poll(readActiveId).toBe("acc-1");
    expect(signInWithToken).not.toHaveBeenCalled();
  });

  it("a failed sign-in surfaces the error message as a toast", async () => {
    vi.mocked(signInWithToken).mockRejectedValue(new Error("That token didn't work"));
    const { element } = createHarness(
      <>
        <SignInCard />
        <Toaster />
      </>
    );

    await render(element);

    await page.getByLabelText("npsso token").fill("stale-token");
    await page.getByText(/sign in to my PlayStation account/i).click();
    await page.getByRole("button", { name: "Sign in" }).click();

    await expect.element(page.getByText("That token didn't work")).toBeVisible();
  });

  // The boundary (`@/server/api/account.effect`, #267) maps each typed PSN
  // failure to its own fixed, user-facing message, and the card surfaces that
  // message verbatim via the toast — so the right recovery copy reaches the user
  // per failure kind rather than a single "expired token" for everything.
  it.each([
    [
      "a rejected credential",
      "That token didn't work — it may be expired. Grab a fresh npsso and try again.",
    ],
    ["a rate-limit", "PlayStation is rate-limiting requests. Wait a moment and try again."],
    ["an upstream outage", "PlayStation is unavailable right now. Try again later."],
    ["an internal error", "Something went wrong on our end. Please try again."],
  ])("surfaces the distinct message for %s", async (_label, message) => {
    vi.mocked(signInWithToken).mockRejectedValue(new Error(message));
    const { element } = createHarness(
      <>
        <SignInCard />
        <Toaster />
      </>
    );

    await render(element);

    await page.getByLabelText("npsso token").fill("stale-token");
    await page.getByText(/sign in to my PlayStation account/i).click();
    await page.getByRole("button", { name: "Sign in" }).click();

    await expect.element(page.getByText(message)).toBeVisible();
    expect(signInWithToken).toHaveBeenCalledExactlyOnceWith({ data: { npsso: "stale-token" } });
  });

  it("falls back to a generic message when the rejection is not an Error", async () => {
    vi.mocked(signInWithToken).mockRejectedValue("boom");
    const { element } = createHarness(
      <>
        <SignInCard />
        <Toaster />
      </>
    );

    await render(element);

    await page.getByLabelText("npsso token").fill("stale-token");
    await page.getByText(/sign in to my PlayStation account/i).click();
    await page.getByRole("button", { name: "Sign in" }).click();

    await expect.element(page.getByText("Sign in failed. Check your token.")).toBeVisible();
  });

  it("shows a signing-in spinner and locks the token input while the request is in flight", async () => {
    onTestFinished(() => localStorage.clear());
    let resolveSignIn: (value: typeof demoDashboard) => void = () => {};
    vi.mocked(signInWithToken).mockReturnValue(
      new Promise((resolve) => {
        resolveSignIn = resolve;
      })
    );
    const { element } = createHarness(<SignInCard />);

    await render(element);

    await page.getByLabelText("npsso token").fill("a-valid-looking-token");
    await page.getByText(/sign in to my PlayStation account/i).click();
    await page.getByRole("button", { name: "Sign in" }).click();

    await expect.element(page.getByRole("button", { name: /signing in/i })).toBeDisabled();
    await expect.element(page.getByLabelText("npsso token")).toBeDisabled();

    resolveSignIn(demoDashboard);
  });
});
