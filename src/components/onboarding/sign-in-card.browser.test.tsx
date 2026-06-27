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
  getRawgGenres: vi.fn(),
  getRawgFranchises: vi.fn(),
  signOut: vi.fn(),
}));

test("renders the connect-account card with the manual steps", async () => {
  const { element } = createHarness(<SignInCard />);

  await render(element);

  await expect.element(page.getByText("Connect your account")).toBeVisible();
  await expect.element(page.getByRole("link", { name: /open the ssocookie page/i })).toBeVisible();
  await expect.element(page.getByRole("link", { name: /explore the demo/i })).toBeVisible();
});

test("discloses the unofficial ToS-violating method before the token step", async () => {
  const { element } = createHarness(<SignInCard />);

  await render(element);

  await expect.element(page.getByText(/unofficial method/i)).toBeVisible();
  await expect.element(page.getByText(/against PlayStation's Terms of Service/i)).toBeVisible();
});

test("expanding the disclosure reveals the read-only detail and the psn-api link", async () => {
  const { element } = createHarness(<SignInCard />);

  await render(element);

  await page.getByText("Learn more").click();

  await expect.element(page.getByText(/It is read-only/i)).toBeVisible();
  await expect.element(page.getByText(/expires after about 2 months/i)).toBeVisible();

  const psnApiLink = page.getByRole("link", { name: /psn-api/i });
  await expect
    .element(psnApiLink)
    .toHaveAttribute("href", "https://github.com/achievements-app/psn-api");
});

test("submitting an empty token shows a validation toast and skips the request", async () => {
  const { element } = createHarness(
    <>
      <SignInCard />
      <Toaster />
    </>
  );

  await render(element);

  await page.getByRole("button", { name: "Sign in" }).click();

  await expect.element(page.getByText("Paste your npsso token first.")).toBeVisible();
  expect(signInWithToken).not.toHaveBeenCalled();
});

test("submitting a token signs in and primes the dashboard cache", async () => {
  vi.mocked(signInWithToken).mockResolvedValue(demoDashboard);
  const { element, queryClient } = createHarness(<SignInCard />);

  await render(element);

  await page.getByLabelText("npsso token").fill("a-valid-looking-token");
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
  await page.getByRole("button", { name: "Sign in" }).click();

  await expect.element(page.getByText("That token didn't work")).toBeVisible();
});
