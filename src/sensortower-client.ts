import { URL } from "url";

const BASE_URL = "https://api.sensortower.com";

export class SensorTowerClient {
  private authToken: string;

  constructor(authToken: string) {
    this.authToken = authToken;
  }

  async request(
    path: string,
    params: Record<string, string | string[] | number | boolean | undefined> = {},
    method: "GET" | "POST" = "GET"
  ): Promise<unknown> {
    const url = new URL(path, BASE_URL);
    url.searchParams.set("auth_token", this.authToken);

    for (const [key, value] of Object.entries(params)) {
      if (value === undefined || value === "") continue;
      if (Array.isArray(value)) {
        url.searchParams.set(key, value.join(","));
      } else {
        url.searchParams.set(key, String(value));
      }
    }

    const opts: RequestInit = { method };

    if (method === "POST") {
      opts.headers = { "Content-Type": "application/json" };
      const body: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(params)) {
        if (value !== undefined && value !== "") body[key] = value;
      }
      // For POST, clear query params except auth_token
      for (const key of [...url.searchParams.keys()]) {
        if (key !== "auth_token") url.searchParams.delete(key);
      }
      opts.body = JSON.stringify(body);
    }

    const response = await fetch(url.toString(), opts);

    const text = await response.text();

    if (!response.ok) {
      // Try to parse error as JSON for cleaner messages
      try {
        const errorJson = JSON.parse(text);
        throw new Error(
          `SensorTower API error ${response.status}: ${JSON.stringify(errorJson)}`
        );
      } catch (e) {
        if (e instanceof SyntaxError) {
          throw new Error(`SensorTower API error ${response.status}: ${text}`);
        }
        throw e;
      }
    }

    return JSON.parse(text);
  }
}
