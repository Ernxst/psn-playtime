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
      <div
        className="playloom-poster-fallback absolute inset-0 grid place-items-center bg-[linear-gradient(155deg,#173d96,#191c22_68%)] font-[Fraunces_Variable] text-[25px] text-white/88"
        aria-hidden="true"
      >
        <span>{initials(title)}</span>
      </div>
    );
  }
  return (
    <div
      className="playloom-poster-art absolute inset-0 bg-[url('/playloom/poster-atlas.png')] bg-[length:300%_200%] bg-no-repeat"
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

const posterTones = [
  "[--playloom-poster-tone:#18365d]",
  "[--playloom-poster-tone:#70402d]",
  "[--playloom-poster-tone:#244d42]",
  "[--playloom-poster-tone:#552f48]",
  "[--playloom-poster-tone:#3e405f]",
] as const;

function posterTone(title: string): number {
  const value = Array.from(title).reduce((sum, character) => sum + character.charCodeAt(0), 0);
  return value % posterTones.length;
}

export function GamePoster({ game, featured = false }: { game: GamePlay; featured?: boolean }) {
  const slot = posterSlot(game);
  const tone = posterTone(game.name);
  const className = `playloom-poster relative min-w-12 overflow-hidden rounded-[2px] bg-[#1c2028] shadow-[0_0_0_1px_rgb(0_0_0/10%),0_12px_32px_rgb(17_20_25/16%)] ${featured ? "playloom-poster-featured aspect-[2/3]" : "aspect-[3/4]"} ${posterTones[tone]}`;
  const fallbackLabel = slot ? "" : ", deterministic fallback";
  return (
    <figure
      className={className}
      data-fallback={slot ? undefined : "true"}
      data-source={posterSource(game, slot)}
      data-tone={tone}
      aria-label={`${game.name} artwork${fallbackLabel}`}
    >
      {game.imageUrl ? (
        <>
          {/* A real source element proves square PSN artwork is composed, not blindly cropped. */}
          {/* oxlint-disable-next-line react-doctor/nextjs-no-img-element -- local square fixture must prove source-above composition */}
          <img
            className="playloom-poster-psn absolute inset-x-0 top-0 z-1 h-3/4 w-full object-cover"
            src={game.imageUrl}
            alt=""
            aria-hidden="true"
          />
          <div
            className="playloom-poster-extension absolute inset-x-0 bottom-0 z-1 h-1/4 bg-[var(--playloom-poster-tone)]"
            aria-hidden="true"
          />
        </>
      ) : (
        <PosterArtwork slot={slot} title={game.name} />
      )}
      <figcaption className="playloom-poster-caption absolute inset-x-0 bottom-0 z-2 flex min-h-[28%] flex-col justify-end gap-0.5 bg-[linear-gradient(transparent,color-mix(in_srgb,var(--playloom-poster-tone)_92%,black)_44%)] px-2 pt-[22px] pb-[7px] text-white">
        <span className="line-clamp-2 overflow-hidden text-[8px] font-bold leading-[1.25]">
          {game.name}
        </span>
        <small className="text-[6px] text-white/62">{game.platform}</small>
      </figcaption>
    </figure>
  );
}
