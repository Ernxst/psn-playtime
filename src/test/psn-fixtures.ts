import type {
  AuthTokensResponse,
  ProfileFromUserNameResponse,
  TrophyTitle,
  UserPlayedGamesResponse,
  UserTitlesResponse,
} from "psn-api";

export type PsnProfile = ProfileFromUserNameResponse["profile"];
export type PsnPlayedTitle = UserPlayedGamesResponse["titles"][number];

export const psnAuthTokens: AuthTokensResponse = {
  accessToken: "access-token",
  expiresIn: 3600,
  idToken: "id-token",
  refreshToken: "refresh-token",
  refreshTokenExpiresIn: 7200,
  scope: "psn:mobile.v2.core psn:clientapp",
  tokenType: "bearer",
};

const baseProfile: PsnProfile = {
  onlineId: "Ernxst_",
  accountId: "acc-1",
  npId: "np-1",
  avatarUrls: [{ size: "xl", avatarUrl: "https://img/xl" }],
  plus: 1,
  aboutMe: "Hello there",
  languagesUsed: ["en"],
  trophySummary: {
    level: 220,
    progress: 70,
    earnedTrophies: { bronze: 887, silver: 188, gold: 54, platinum: 9 },
  },
  isOfficiallyVerified: false,
  personalDetail: { firstName: "", lastName: "", profilePictureUrls: [] },
  personalDetailSharing: "no",
  personalDetailSharingRequestMessageFlag: false,
  primaryOnlineStatus: "offline",
  presences: [],
  friendRelation: "no-relation",
  requestMessageFlag: false,
  blocking: false,
  following: false,
  consoleAvailability: { availabilityStatus: "unavailable" },
};

const basePlayedTitle: PsnPlayedTitle = {
  titleId: "",
  name: "",
  localizedName: "",
  imageUrl: "",
  localizedImageUrl: "",
  category: "ps4_game",
  service: "none",
  playCount: 0,
  concept: { id: 0, titleIds: [], name: "", media: { audios: [], videos: [], images: [] } },
  media: {},
  firstPlayedDateTime: "",
  lastPlayedDateTime: "",
  playDuration: "PT0S",
};

const baseTrophyTitle: TrophyTitle = {
  npServiceName: "trophy",
  npCommunicationId: "",
  trophySetVersion: "01.00",
  trophyTitleName: "",
  trophyTitleIconUrl: "",
  trophyTitlePlatform: "PS4",
  hasTrophyGroups: false,
  definedTrophies: { bronze: 0, silver: 0, gold: 0, platinum: 0 },
  progress: 0,
  earnedTrophies: { bronze: 0, silver: 0, gold: 0, platinum: 0 },
  hiddenFlag: false,
  lastUpdatedDateTime: "",
};

export const psnProfile = (overrides: Partial<PsnProfile> = {}): ProfileFromUserNameResponse => ({
  profile: { ...baseProfile, ...overrides },
});

export const psnPlayedTitle = (overrides: Partial<PsnPlayedTitle>): PsnPlayedTitle => ({
  ...basePlayedTitle,
  ...overrides,
});

export const psnTrophyTitle = (overrides: Partial<TrophyTitle>): TrophyTitle => ({
  ...baseTrophyTitle,
  ...overrides,
});

export const psnPlayedPage = (
  titles: PsnPlayedTitle[] = [],
  totalItemCount = titles.length
): UserPlayedGamesResponse => ({ titles, totalItemCount, nextOffset: 0, previousOffset: 0 });

export const psnTrophyPage = (
  trophyTitles: TrophyTitle[] = [],
  totalItemCount = trophyTitles.length
): UserTitlesResponse => ({ trophyTitles, totalItemCount, nextOffset: 0, previousOffset: 0 });

export const psnTokenResponse = {
  access_token: psnAuthTokens.accessToken,
  expires_in: psnAuthTokens.expiresIn,
  id_token: psnAuthTokens.idToken,
  refresh_token: psnAuthTokens.refreshToken,
  refresh_token_expires_in: psnAuthTokens.refreshTokenExpiresIn,
  scope: psnAuthTokens.scope,
  token_type: psnAuthTokens.tokenType,
};
