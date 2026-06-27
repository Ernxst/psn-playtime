import { expect, test, vi } from "vitest";
import { render } from "vitest-browser-react";
import { page } from "vitest/browser";
import { genreBreakdown } from "@/lib/psn/analytics";
import { demoDashboard } from "@/lib/psn/mock";
import { GenreChart } from "./charts";

test("genre donut tooltip shows the genre name on hover", async () => {
  // Tailwind CSS isn't loaded in the browser test, so the chart's `h-[300px]`
  // class resolves to height 0 and Recharts renders nothing — give it a size.
  document.head.insertAdjacentHTML(
    "beforeend",
    `<style>[data-slot="chart"]{width:300px;height:300px}</style>`
  );

  const topSlice = genreBreakdown(demoDashboard)[0];
  if (!topSlice) throw new Error("expected at least one genre slice");
  const topGenre = topSlice.genre;
  const { container } = await render(<GenreChart data={demoDashboard} />);

  const sector = await vi.waitFor(() => {
    const el = container.querySelector(".recharts-sector");
    if (!el) throw new Error("expected a pie sector to render");
    return el;
  });
  // Recharts wires the tooltip to the sector's mouse-enter handler; dispatch it
  // directly to avoid fighting the slice's entrance animation.
  sector.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));

  await expect.element(page.getByText(topGenre)).toBeInTheDocument();
});
