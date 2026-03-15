import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";
import { ChildProcess, spawn } from "child_process";

// Known app IDs
const TIKTOK_IOS = "835599320";
const TIKTOK_ANDROID = "com.zhiliaoapp.musically";
const TIKTOK_UNIFIED = "56cbbce9d48401b048003405";
const BYTEDANCE_IOS_PUBLISHER = "1322881000";

const PORT = 4111;
let serverProcess: ChildProcess;
let client: Client;

beforeAll(async () => {
  serverProcess = spawn("node", ["dist/index.js"], {
    env: {
      ...process.env,
      SENSORTOWER_API_KEY: process.env.SENSORTOWER_API_KEY,
      MCP_TRANSPORT: "http",
      PORT: String(PORT),
    },
    stdio: ["pipe", "pipe", "pipe"],
  });

  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("Server start timeout")), 10000);
    serverProcess.stderr?.on("data", (data: Buffer) => {
      if (data.toString().includes("running on")) {
        clearTimeout(timeout);
        resolve();
      }
    });
    serverProcess.on("error", (err) => {
      clearTimeout(timeout);
      reject(err);
    });
  });

  const url = new URL(`http://localhost:${PORT}/sse`);
  const transport = new SSEClientTransport(url);
  client = new Client({ name: "test-client", version: "1.0.0" });
  await client.connect(transport);
}, 15000);

afterAll(async () => {
  await client?.close();
  serverProcess?.kill();
});

function callTool(name: string, args: Record<string, unknown> = {}) {
  return client.callTool({ name, arguments: args });
}

function parseResult(result: Awaited<ReturnType<typeof callTool>>): unknown {
  const text = (result.content as Array<{ type: string; text: string }>)[0]?.text;
  return JSON.parse(text);
}

describe("SensorTower MCP Tools", () => {
  // 1. search_apps
  it("search_apps", async () => {
    const data = parseResult(await callTool("search_apps", {
      term: "tiktok", os: "unified", entity_type: "app", limit: 3,
    })) as any[];
    expect(Array.isArray(data)).toBe(true);
    expect(data.length).toBeGreaterThan(0);
    expect(data[0]).toHaveProperty("name");
  }, 30000);

  // 2. get_app_details
  it("get_app_details", async () => {
    const data = parseResult(await callTool("get_app_details", {
      app_ids: TIKTOK_IOS, os: "ios",
    })) as any;
    expect(data).toHaveProperty("apps");
  }, 30000);

  // 3. get_sales_estimates
  it("get_sales_estimates", async () => {
    const data = parseResult(await callTool("get_sales_estimates", {
      app_ids: TIKTOK_IOS, os: "ios",
      start_date: "2025-01-01", end_date: "2025-01-31",
      countries: "US", date_granularity: "monthly",
    }));
    expect(data).toBeDefined();
  }, 30000);

  // 4. get_top_apps
  it("get_top_apps", async () => {
    const data = parseResult(await callTool("get_top_apps", {
      os: "ios", category: "0", date: "2025-01-01",
      chart_type: "topfreeapplications", country: "US", limit: 5,
    })) as any;
    expect(data).toHaveProperty("ranking");
  }, 30000);

  // 5. get_category_ranking_history
  it("get_category_ranking_history", async () => {
    const result = await callTool("get_category_ranking_history", {
      app_id: TIKTOK_IOS, os: "ios", category: "6016",
      chart_type: "topfreeapplications", countries: "US",
      start_date: "2025-01-01", end_date: "2025-03-01",
    });
    const text = (result.content as Array<{ type: string; text: string }>)[0]?.text;
    expect(text).toBeDefined();
  }, 30000);

  // 6. get_top_apps_comparison
  it("get_top_apps_comparison", async () => {
    const data = parseResult(await callTool("get_top_apps_comparison", {
      os: "ios", date: "2025-01-01", time_range: "month",
      category: "0", device_type: "total",
      countries: "US", comparison_attribute: "absolute",
      measure: "units", limit: 5,
    })) as any[];
    expect(Array.isArray(data)).toBe(true);
    expect(data.length).toBeGreaterThan(0);
  }, 30000);

  // 7. get_reviews
  it("get_reviews", async () => {
    const data = parseResult(await callTool("get_reviews", {
      app_id: TIKTOK_IOS, os: "ios",
      countries: "US", limit: 5, offset: 0,
    }));
    expect(data).toBeDefined();
  }, 30000);

  // 8. get_ratings
  it("get_ratings", async () => {
    const data = parseResult(await callTool("get_ratings", {
      app_id: TIKTOK_IOS, os: "ios", countries: "US",
    }));
    expect(data).toBeDefined();
  }, 30000);

  // 9. get_active_users
  it("get_active_users", async () => {
    const data = parseResult(await callTool("get_active_users", {
      app_ids: TIKTOK_ANDROID, os: "android",
      start_date: "2025-01-01", end_date: "2025-01-31",
      countries: "US", date_granularity: "monthly", time_period: "month",
    }));
    expect(data).toBeDefined();
  }, 30000);

  // 10. get_retention
  it("get_retention", async () => {
    const data = parseResult(await callTool("get_retention", {
      app_ids: TIKTOK_ANDROID, os: "android",
      start_date: "2025-01-01", end_date: "2025-01-31",
      countries: "US", date_granularity: "all_time",
    }));
    expect(data).toBeDefined();
  }, 30000);

  // 11. get_demographics
  it("get_demographics", async () => {
    const data = parseResult(await callTool("get_demographics", {
      app_ids: TIKTOK_ANDROID, os: "android",
      start_date: "2025-01-01", end_date: "2025-01-31",
      countries: "US",
    }));
    expect(data).toBeDefined();
  }, 30000);

  // 12. research_keyword
  it("research_keyword", async () => {
    const data = parseResult(await callTool("research_keyword", {
      term: "video editor", os: "ios", country: "US",
    })) as any;
    expect(data).toHaveProperty("keyword");
  }, 30000);

  // 13. get_app_keywords
  it("get_app_keywords", async () => {
    const data = parseResult(await callTool("get_app_keywords", {
      app_id: TIKTOK_IOS, os: "ios", country: "US",
    }));
    expect(data).toBeDefined();
  }, 60000);

  // 14. get_trending_searches
  it("get_trending_searches", async () => {
    const data = parseResult(await callTool("get_trending_searches", {
      country: "US",
    }));
    expect(data).toBeDefined();
  }, 30000);

  // 15. get_ad_creatives (may fail with 403 if plan doesn't include Ad Intel)
  it("get_ad_creatives", async () => {
    const result = await callTool("get_ad_creatives", {
      app_ids: TIKTOK_IOS, os: "ios",
      start_date: "2025-01-01", end_date: "2025-01-31",
      countries: "US", limit: 5,
    });
    // Accept both success and API error (plan limitation)
    const text = (result.content as Array<{ type: string; text: string }>)[0]?.text;
    expect(text).toBeDefined();
  }, 30000);

  // 16. get_ad_network_analysis (may fail with 403 if plan doesn't include Ad Intel)
  it("get_ad_network_analysis", async () => {
    const result = await callTool("get_ad_network_analysis", {
      app_ids: TIKTOK_IOS, os: "ios",
      start_date: "2025-01-01", end_date: "2025-01-31",
      countries: "US", date_granularity: "monthly",
    });
    const text = (result.content as Array<{ type: string; text: string }>)[0]?.text;
    expect(text).toBeDefined();
  }, 30000);

  // 17. get_top_publishers
  it("get_top_publishers", async () => {
    const data = parseResult(await callTool("get_top_publishers", {
      os: "ios", date: "2025-01-01", time_range: "month",
      countries: "US", measure: "units", limit: 5,
    })) as any[];
    expect(Array.isArray(data)).toBe(true);
    expect(data.length).toBeGreaterThan(0);
  }, 30000);

  // 18. get_publisher_apps
  it("get_publisher_apps", async () => {
    const data = parseResult(await callTool("get_publisher_apps", {
      publisher_id: BYTEDANCE_IOS_PUBLISHER, os: "ios",
    }));
    expect(data).toBeDefined();
  }, 30000);

  // 19. get_featured_apps
  it("get_featured_apps", async () => {
    const data = parseResult(await callTool("get_featured_apps", {
      os: "ios", country: "US",
    }));
    expect(data).toBeDefined();
  }, 30000);

  // 20. get_download_sources
  it("get_download_sources", async () => {
    const data = parseResult(await callTool("get_download_sources", {
      app_ids: TIKTOK_IOS, os: "ios",
      start_date: "2025-01-01", end_date: "2025-01-31",
      countries: "US",
    }));
    expect(data).toBeDefined();
  }, 30000);

  // 21. get_top_iap
  it("get_top_iap", async () => {
    const data = parseResult(await callTool("get_top_iap", {
      app_id: TIKTOK_IOS,
    }));
    expect(data).toBeDefined();
  }, 30000);

  // 22. get_unified_apps
  it("get_unified_apps", async () => {
    const data = parseResult(await callTool("get_unified_apps", {
      app_ids: TIKTOK_UNIFIED, app_id_type: "unified",
    })) as any;
    expect(data).toHaveProperty("apps");
  }, 30000);

  // 23. get_search_ads_apps
  it("get_search_ads_apps", async () => {
    const data = parseResult(await callTool("get_search_ads_apps", {
      term: "video editor", country: "US",
    })) as any;
    expect(data).toHaveProperty("apps");
  }, 30000);

  // 24. get_api_usage
  it("get_api_usage", async () => {
    const data = parseResult(await callTool("get_api_usage"));
    expect(data).toBeDefined();
  }, 30000);
});
