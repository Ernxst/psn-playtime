import type {
  AuthTokensResponse,
  ProfileFromUserNameResponse,
  TrophyTitle,
  UserPlayedGamesResponse,
  UserTitlesResponse,
} from "psn-api";

export type PsnProfile = ProfileFromUserNameResponse["profile"];
export type PsnPlayedTitle = UserPlayedGamesResponse["titles"][number];

type PsnTokenResponse = {
  access_token: string;
  expires_in: number;
  id_token: string;
  refresh_token: string;
  refresh_token_expires_in: number;
  scope: string;
  token_type: string;
};

const fresh = <Value>(value: Value): Value => structuredClone(value);

export const createPsnAuthTokens = (
  overrides: Partial<AuthTokensResponse> = {}
): AuthTokensResponse =>
  fresh({
    accessToken: "access-token",
    expiresIn: 3600,
    idToken: "id-token",
    refreshToken: "refresh-token",
    refreshTokenExpiresIn: 7200,
    scope: "psn:mobile.v2.core psn:clientapp",
    tokenType: "bearer",
    ...overrides,
  });

export const createPsnTokenResponse = (
  overrides: Partial<PsnTokenResponse> = {}
): PsnTokenResponse => {
  const tokens = createPsnAuthTokens();

  return fresh({
    access_token: tokens.accessToken,
    expires_in: tokens.expiresIn,
    id_token: tokens.idToken,
    refresh_token: tokens.refreshToken,
    refresh_token_expires_in: tokens.refreshTokenExpiresIn,
    scope: tokens.scope,
    token_type: tokens.tokenType,
    ...overrides,
  });
};

export const psnProfile = (overrides: Partial<PsnProfile> = {}): ProfileFromUserNameResponse =>
  fresh({
    profile: {
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
      ...overrides,
    },
  });

export const psnPlayedTitle = (overrides: Partial<PsnPlayedTitle>): PsnPlayedTitle =>
  fresh({
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
    ...overrides,
  });

export const psnTrophyTitle = (overrides: Partial<TrophyTitle>): TrophyTitle =>
  fresh({
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
    ...overrides,
  });

export const psnPlayedPage = (
  titles: PsnPlayedTitle[] = [],
  totalItemCount = titles.length
): UserPlayedGamesResponse => fresh({ titles, totalItemCount, nextOffset: 0, previousOffset: 0 });

export const psnTrophyPage = (
  trophyTitles: TrophyTitle[] = [],
  totalItemCount = trophyTitles.length
): UserTitlesResponse => fresh({ trophyTitles, totalItemCount, nextOffset: 0, previousOffset: 0 });

// Compatibility values for consumers that have not migrated to the factories yet.
export const psnAuthTokens = createPsnAuthTokens();
export const psnTokenResponse = createPsnTokenResponse();
