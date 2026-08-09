import { useState } from "react";
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

function PosterSkeleton() {
  return <div className="absolute inset-0 bg-white/12" aria-label="Artwork loading" />;
}

type SourceArtworkState = "loading" | "ready" | "failed";

function SourceArtwork({
  src,
  title,
  state,
  onError,
  onLoad,
}: {
  src: string;
  title: string;
  state: SourceArtworkState;
  onError: () => void;
  onLoad: () => void;
}) {
  return (
    <>
      {/* A real source element proves square PSN artwork is composed, not blindly cropped. */}
      {/* oxlint-disable-next-line react-doctor/nextjs-no-img-element -- source artwork is composed inside the fixed poster frame */}
      <img
        className={`playloom-poster-psn absolute inset-x-0 top-0 z-1 h-3/4 w-full object-cover ${state === "ready" ? "opacity-100" : "opacity-0"}`}
        src={src}
        alt=""
        aria-hidden="true"
        onError={onError}
        onLoad={onLoad}
      />
      {state === "loading" && <PosterSkeleton />}
      {state === "failed" && <PosterArtwork slot={undefined} title={title} />}
      {state !== "failed" && (
        <div
          className="playloom-poster-extension absolute inset-x-0 bottom-0 z-1 h-1/4 bg-[var(--playloom-poster-tone)]"
          aria-hidden="true"
        />
      )}
    </>
  );
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

type PosterSource = "psn" | "rawg-fixture" | "deterministic";

function posterSource(game: GamePlay, slot: PosterSlot | undefined): PosterSource {
  if (game.imageUrl) return "psn";
  if (slot) return "rawg-fixture";
  return "deterministic";
}

function posterContent({
  game,
  slot,
  state,
  onError,
  onLoad,
}: {
  game: GamePlay;
  slot: PosterSlot | undefined;
  state: SourceArtworkState;
  onError: () => void;
  onLoad: () => void;
}) {
  if (game.imageUrl) {
    return (
      <SourceArtwork
        key={game.imageUrl}
        src={game.imageUrl}
        title={game.name}
        state={state}
        onError={onError}
        onLoad={onLoad}
      />
    );
  }
  return <PosterArtwork slot={slot} title={game.name} />;
}

function fallbackLabel(source: PosterSource): string {
  return source === "deterministic" ? ", deterministic fallback" : "";
}

export function GamePoster({ game, featured = false }: { game: GamePlay; featured?: boolean }) {
  const [artworkState, setArtworkState] = useState<SourceArtworkState>("loading");
  const slot = posterSlot(game);
  const source = artworkState === "failed" ? "deterministic" : posterSource(game, slot);
  const tone = posterTone(game.name);
  const className = `playloom-poster relative min-w-12 overflow-hidden rounded-[2px] bg-[#1c2028] shadow-[0_0_0_1px_rgb(0_0_0/10%),0_12px_32px_rgb(17_20_25/16%)] ${featured ? "playloom-poster-featured aspect-[2/3]" : "aspect-[3/4]"} ${posterTones[tone]}`;
  return (
    <figure
      className={className}
      data-fallback={source === "deterministic" ? "true" : undefined}
      data-source={source}
      data-tone={tone}
      aria-label={`${game.name} artwork${fallbackLabel(source)}`}
    >
      {posterContent({
        game,
        slot,
        state: artworkState,
        onError: () => setArtworkState("failed"),
        onLoad: () => setArtworkState("ready"),
      })}
      <figcaption className="playloom-poster-caption absolute inset-x-0 bottom-0 z-2 flex min-h-[28%] flex-col justify-end gap-0.5 bg-[linear-gradient(transparent,color-mix(in_srgb,var(--playloom-poster-tone)_92%,black)_44%)] px-2 pt-[22px] pb-[7px] text-white">
        <span className="line-clamp-2 overflow-hidden text-[8px] font-bold leading-[1.25]">
          {game.name}
        </span>
        <small className="text-[6px] text-white/62">{game.platform}</small>
      </figcaption>
    </figure>
  );
}
