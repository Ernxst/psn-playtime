/* oxlint-disable test-contract/no-dom-selector -- Poster provenance is expressed by the rendered image element and its source. */
import { describe, expect, it } from "vitest";
import { render } from "vitest-browser-react";
import { signedInPreviewDashboard } from "@/domain/mock";
import { GamePoster } from "./poster";
import { prototypeDashboard } from "./prototype-data";

const sourceImageUrl = "https://image.api.playstation.com/source-artwork.png";

describe("GamePoster", () => {
  it("renders imported source artwork with PSN provenance after the prototype path", async () => {
    const imported = {
      ...signedInPreviewDashboard,
      games: [{ ...signedInPreviewDashboard.games[0]!, imageUrl: sourceImageUrl }],
    };
    const game = prototypeDashboard(imported).games[0]!;

    const { container } = await render(<GamePoster game={game} />);

    expect(container.querySelector("figure")).toHaveAttribute("data-source", "psn");
    expect(container.querySelector("img")).toHaveAttribute("src", sourceImageUrl);
  });

  it("keeps its fixed geometry while a source image resolves without flashing fallback copy", async () => {
    const game = { ...signedInPreviewDashboard.games[0]!, imageUrl: sourceImageUrl };
    const { container } = await render(<GamePoster game={game} />);
    const poster = container.querySelector("figure")!;
    const image = container.querySelector("img")!;

    expect(poster).toHaveClass("aspect-[3/4]");
    expect(container.querySelector('[aria-label="Artwork loading"]')).toBeInTheDocument();
    expect(container.querySelector(".playloom-poster-fallback")).not.toBeInTheDocument();

    image.dispatchEvent(new Event("load"));

    await expect.poll(() => container.querySelector('[aria-label="Artwork loading"]')).toBeNull();
    expect(container.querySelector(".playloom-poster-fallback")).not.toBeInTheDocument();
    expect(image).toHaveClass("opacity-100");
  });

  it("uses the deterministic poster only after a source image fails", async () => {
    const game = { ...signedInPreviewDashboard.games[0]!, imageUrl: sourceImageUrl };
    const { container } = await render(<GamePoster game={game} featured />);
    const poster = container.querySelector("figure")!;

    expect(poster).toHaveClass("aspect-[2/3]");
    expect(container.querySelector(".playloom-poster-fallback")).not.toBeInTheDocument();

    container.querySelector("img")!.dispatchEvent(new Event("error"));

    await expect.poll(() => container.querySelector(".playloom-poster-fallback")).not.toBeNull();
    expect(poster).toHaveClass("aspect-[2/3]");
    expect(poster).toHaveAttribute("data-source", "deterministic");
    expect(poster).toHaveAttribute("data-fallback", "true");
    expect(poster).toHaveAccessibleName(/deterministic fallback/);
  });
});
