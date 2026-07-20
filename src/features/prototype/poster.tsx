import type { GamePlay } from "@/server/providers/account/snapshot";
import { posterSlot, type PosterSlot } from "./prototype-data";

const position: Record<PosterSlot, string> = {
  city: "0% 0%",
  stadium: "50% 0%",
  snow: "100% 0%",
  blocks: "0% 100%",
  desert: "50% 100%",
  coast: "100% 100%",
};

function initials(title: string): string {
  return title
    .replace(/[^A-Za-z0-9 ]/g, "")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 3)
    .map((word) => word[0])
    .join("");
}

function PosterArtwork({ slot, title }: { slot: PosterSlot | undefined; title: string }) {
  if (!slot) {
    return (
      <div className="playloom-poster-fallback" aria-hidden="true">
        <span>{initials(title)}</span>
      </div>
    );
  }
  return (
    <div
      className="playloom-poster-art"
      style={{ backgroundPosition: position[slot] }}
      aria-hidden="true"
    />
  );
}

function posterSource(game: GamePlay, slot: PosterSlot | undefined): string {
  if (game.imageUrl) return "psn";
  if (slot) return "rawg-fixture";
  return "deterministic";
}

function posterTone(title: string): number {
  const value = Array.from(title).reduce((sum, character) => sum + character.charCodeAt(0), 0);
  return value % 5;
}

export function GamePoster({ game, featured = false }: { game: GamePlay; featured?: boolean }) {
  const slot = posterSlot(game);
  const className = featured ? "playloom-poster playloom-poster-featured" : "playloom-poster";
  const fallbackLabel = slot ? "" : ", deterministic fallback";
  return (
    <figure
      className={className}
      data-fallback={slot ? undefined : "true"}
      data-source={posterSource(game, slot)}
      data-tone={posterTone(game.name)}
      aria-label={`${game.name} artwork${fallbackLabel}`}
    >
      {game.imageUrl ? (
        <>
          {/* A real source element proves square PSN artwork is composed, not blindly cropped. */}
          {/* oxlint-disable-next-line react-doctor/nextjs-no-img-element -- local square fixture must prove source-above composition */}
          <img className="playloom-poster-psn" src={game.imageUrl} alt="" aria-hidden="true" />
          <div className="playloom-poster-extension" aria-hidden="true" />
        </>
      ) : (
        <PosterArtwork slot={slot} title={game.name} />
      )}
      <figcaption className="playloom-poster-caption">
        <span>{game.name}</span>
        <small>{game.platform}</small>
      </figcaption>
    </figure>
  );
}
