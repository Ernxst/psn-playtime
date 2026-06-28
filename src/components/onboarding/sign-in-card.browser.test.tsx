import { expect, test, vi } from "vitest";
import { render } from "vitest-browser-react";
import { page } from "vitest/browser";
import { Toaster } from "@/components/ui/sonner";
import { demoDashboard } from "@/lib/psn/mock";
import { signInWithToken } from "@/server/psn";
import { createHarness } from "@/test/harness";
import { SignInCard } from "./sign-in-card";

vi.mock("@/server/psn", () => ({
  signInWithToken: vi.fn(),
  getDashboard: vi.fn(),
  signOut: vi.fn(),
}));

test("renders the connect-account card with the manual steps", async () => {
  const { element } = createHarness(<SignInCard />);

  await render(element);

  await expect.element(page.getByText("Connect your account")).toBeVisible();
  await expect.element(page.getByRole("link", { name: /open the ssocookie page/i })).toBeVisible();
  await expect.element(page.getByRole("link", { name: /explore the demo/i })).toBeVisible();
});

test("keeps the risk details hidden until the learn-more action is opened", async () => {
  const { element } = createHarness(<SignInCard />);

  await render(element);

  await expect.element(page.getByText("Learn about the risk")).toBeVisible();
  await expect.element(page.getByText(/It is read-only/i)).not.toBeVisible();
  await expect.element(page.getByText(/never logged or stored on the server/i)).not.toBeVisible();
});

test("opening the learn-more action reveals the read-only, storage, open-source and self-host detail", async () => {
  const { element } = createHarness(<SignInCard />);

  await render(element);

  await page.getByText("Learn about the risk").click();

  await expect.element(page.getByText(/It is read-only/i)).toBeVisible();
  await expect.element(page.getByText(/httpOnly session cookie/i)).toBeVisible();
  await expect.element(page.getByText(/self-host your own instance/i)).toBeVisible();
  await expect.element(page.getByText(/expires after about 2 months/i)).toBeVisible();

  const repoLink = page.getByRole("link", { name: /open source/i });
  await expect.element(repoLink).toHaveAttribute("href", "https://github.com/Ernxst/psn-playtime");
});

test("disables sign-in until the risk is acknowledged", async () => {
  const { element } = createHarness(<SignInCard />);

  await render(element);

  await expect.element(page.getByRole("button", { name: "Sign in" })).toBeDisabled();

  await page.getByText(/sign in to my PlayStation account/i).click();

  await expect.element(page.getByRole("button", { name: "Sign in" })).toBeEnabled();
});

test("does not request sign-in while the risk is unacknowledged", async () => {
  const { element } = createHarness(<SignInCard />);

  await render(element);

  await page.getByLabelText("npsso token").fill("a-valid-looking-token");

  await expect.element(page.getByRole("button", { name: "Sign in" })).toBeDisabled();
  expect(signInWithToken).not.toHaveBeenCalled();
});

test("submitting an empty token after acknowledging shows a validation toast and skips the request", async () => {
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

test("submitting a token after acknowledging signs in and primes the dashboard cache", async () => {
  vi.mocked(signInWithToken).mockResolvedValue(demoDashboard);
  const { element, queryClient } = createHarness(<SignInCard />);

  await render(element);

  await page.getByLabelText("npsso token").fill("a-valid-looking-token");
  await page.getByText(/sign in to my PlayStation account/i).click();
  await page.getByRole("button", { name: "Sign in" }).click();

  expect(signInWithToken).toHaveBeenCalledExactlyOnceWith({
    data: { npsso: "a-valid-looking-token" },
  });
  await expect.poll(() => queryClient.getQueryData(["dashboard"])).toBe(demoDashboard);
});

test("a failed sign-in surfaces the error message as a toast", async () => {
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
