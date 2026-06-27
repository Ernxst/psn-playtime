import { describe, expect, it } from "vitest";
import { enrichTitle, platformOf } from "./enrich";
import type { Genre, Platform } from "./types";

describe(".enrichTitle", () => {
  it.each<[string, Genre, string | undefined]>([
    ["Call of Duty®: Modern Warfare®", "Shooter", "Call of Duty"],
    ["Forza Horizon 5", "Racing", "Forza"],
    ["Horizon Forbidden West", "Open World", "Horizon"],
    ["EA SPORTS FC™ 24", "Sports", "FIFA / EA FC"],
    ["NBA 2K19", "Sports", "NBA 2K"],
    ["Grand Theft Auto V", "Open World", "Grand Theft Auto"],
    ["The Witcher 3: Wild Hunt", "RPG", "The Witcher"],
    ["F1® 2019", "Racing", "F1"],
  ])("classifies %s by its franchise rule", (name, genre, franchise) => {
    expect(enrichTitle(name)).toEqual({ genre, franchise, isApp: false });
  });

  it.each<[string, Genre]>([
    ["Crysis® Remastered", "Shooter"],
    ["Destiny 2", "Shooter"],
    ["HELLDIVERS™ 2", "Shooter"],
    ["UNO®", "Indie/Casual"],
  ])("falls back to a genre-only rule for %s", (name, genre) => {
    expect(enrichTitle(name)).toEqual({ genre, franchise: undefined, isApp: false });
  });

  it("leaves an unknown title ungrouped", () => {
    expect(enrichTitle("Some Brand New Game")).toEqual({
      genre: "Other",
      franchise: undefined,
      isApp: false,
    });
  });

  it.each([
    "YouTube",
    "Netflix",
    "Spotify",
    "Disney+",
    "BBC iPlayer",
    "NOW",
    "HBO Max",
    "Max",
  ])("flags %s as a streaming app", (name) => {
    expect(enrichTitle(name)).toEqual({ genre: "Other", isApp: true });
  });

  it("classifies Mad Max as a game, not the Max streaming app", () => {
    expect(enrichTitle("Mad Max")).toEqual({
      genre: "Other",
      franchise: undefined,
      isApp: false,
    });
  });

  it("flags a title as an app from its psn-api media category", () => {
    expect(enrichTitle("Mystery Player", "ps5_native_media_app")).toEqual({
      genre: "Other",
      isApp: true,
    });
  });
});

describe(".platformOf", () => {
  it.each<[string | undefined, string, Platform]>([
    ["ps5_native_game", "Anything", "PS5"],
    ["ps4_game", "Anything", "PS4"],
    ["psvita_title", "Anything", "PSVITA"],
    [undefined, "Grand Theft Auto V (PlayStation®5)", "PS5"],
    ["unknown", "Mystery Title", "OTHER"],
  ])("resolves category %s / name %s to %s", (category, name, platform) => {
    expect(platformOf(category, name)).toBe(platform);
  });

  it("prefers the category over the title name", () => {
    expect(platformOf("ps5_native_game", "Some PS4 Era Game")).toBe("PS5");
  });
});
