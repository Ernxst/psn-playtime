import type {
  AuthTokensResponse,
  ProfileFromUserNameResponse,
  TrophyTitle,
  UserPlayedGamesResponse,
  UserTitlesResponse,
} from "psn-api";
import * as Psn from "@/test/factories/psn";

export type PsnProfile = Psn.Profile;
export type PsnPlayedTitle = Psn.PlayedTitle;

type PsnTokenResponse = Psn.TokenResponse;

export function createPsnAuthTokens(
  overrides: Partial<AuthTokensResponse> = {}
): AuthTokensResponse {
  return Psn.authTokens(overrides);
}

export function createPsnTokenResponse(
  overrides: Partial<PsnTokenResponse> = {}
): PsnTokenResponse {
  return Psn.tokenResponse(overrides);
}

export function psnProfile(overrides: Partial<PsnProfile> = {}): ProfileFromUserNameResponse {
  return Psn.profile(overrides);
}

export function psnPlayedTitle(overrides: Partial<PsnPlayedTitle>): PsnPlayedTitle {
  return Psn.playedTitle(overrides);
}

export function psnTrophyTitle(overrides: Partial<TrophyTitle>): TrophyTitle {
  return Psn.trophyTitle(overrides);
}

export function psnPlayedPage(
  titles: PsnPlayedTitle[] = [],
  totalItemCount = titles.length
): UserPlayedGamesResponse {
  return Psn.playedPage(titles, totalItemCount);
}

export function psnTrophyPage(
  trophyTitles: TrophyTitle[] = [],
  totalItemCount = trophyTitles.length
): UserTitlesResponse {
  return Psn.trophyPage(trophyTitles, totalItemCount);
}

// Compatibility values remain until PSN consumers migrate to factories.
export const psnAuthTokens = Psn.authTokens();
export const psnTokenResponse = Psn.tokenResponse();
