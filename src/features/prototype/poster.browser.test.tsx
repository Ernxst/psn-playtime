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
});
