export type SentinelHubConfig = {
  baseUrl: string;
  clientId: string;
  clientSecret: string;
};

export function getSentinelHubConfig(): SentinelHubConfig {
  const clientId = process.env.SENTINELHUB_CLIENT_ID?.trim();
  const clientSecret = process.env.SENTINELHUB_CLIENT_SECRET?.trim();
  const baseUrl =
    process.env.SENTINELHUB_BASE_URL?.trim() || "https://services.sentinel-hub.com";

  if (!clientId || !clientSecret) {
    throw new Error(
      "Sentinel Hub credentials are missing. Set SENTINELHUB_CLIENT_ID and SENTINELHUB_CLIENT_SECRET in .env.local.",
    );
  }

  return {
    baseUrl: baseUrl.replace(/\/+$/g, ""),
    clientId,
    clientSecret,
  };
}
