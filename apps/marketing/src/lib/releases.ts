const REPO = "Ludvig-Hedin/t3code";

export const RELEASES_URL = `https://github.com/${REPO}/releases`;

const API_URL = `https://api.github.com/repos/${REPO}/releases/latest`;
const RELEASES_LIST_URL = `https://api.github.com/repos/${REPO}/releases?per_page=20`;

const CACHE_KEY = "birdcode-latest-release";
const CACHE_KEY_PRERELEASE = "birdcode-latest-prerelease";

export interface ReleaseAsset {
  name: string;
  browser_download_url: string;
}

export interface Release {
  tag_name: string;
  html_url: string;
  assets: ReleaseAsset[];
}

export async function fetchLatestRelease(): Promise<Release> {
  const cached = sessionStorage.getItem(CACHE_KEY);
  if (cached) return JSON.parse(cached) as Release;

  const data = await fetch(API_URL).then((r) => r.json());

  if (data?.assets) {
    sessionStorage.setItem(CACHE_KEY, JSON.stringify(data));
  }

  return data as Release;
}

/**
 * Latest GitHub **pre-release** (beta/canary), or `null` if none is published.
 * GitHub’s `releases/latest` endpoint ignores prereleases, so we scan the list.
 */
export async function fetchLatestPrereleaseRelease(): Promise<Release | null> {
  const cached = sessionStorage.getItem(CACHE_KEY_PRERELEASE);
  if (cached) {
    return JSON.parse(cached) as Release | null;
  }

  const data: unknown = await fetch(RELEASES_LIST_URL).then((r) => r.json());
  if (!Array.isArray(data)) {
    return null;
  }

  const pre = data.find(
    (r: { prerelease?: boolean; draft?: boolean }) => r.prerelease === true && r.draft !== true,
  ) as Release | undefined;

  const result = pre?.tag_name && pre?.assets ? pre : null;
  if (result) {
    sessionStorage.setItem(CACHE_KEY_PRERELEASE, JSON.stringify(result));
  }
  return result;
}
