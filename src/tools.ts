import { z } from "zod";
import { SensorTowerClient } from "./sensortower-client.js";

const osEnum = z.enum(["ios", "android", "unified"]).describe("Platform: ios, android, or unified");
const platformEnum = z.enum(["ios", "android"]).describe("Platform: ios or android");
const dateStr = z.string().describe("Date in YYYY-MM-DD format");
const countryCodes = z.string().optional().describe("Comma-separated ISO country codes (e.g. US,GB). Use WW for worldwide");

// ---------- Tool definitions ----------

export function registerTools(
  server: any,
  client: SensorTowerClient
) {
  // 1. Search entities (apps/publishers)
  server.tool(
    "search_apps",
    "Search for apps or publishers by name",
    {
      term: z.string().describe("Search term (min 3 Latin chars or 2 non-Latin)"),
      os: osEnum.default("unified"),
      entity_type: z.enum(["app", "publisher"]).default("app").describe("Entity type to search for"),
      limit: z.number().min(1).max(100).default(20).describe("Max results"),
    },
    async ({ term, os, entity_type, limit }: any) => {
      const data = await client.request(`/v1/${os}/search_entities`, {
        term,
        entity_type,
        limit,
      });
      return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
    }
  );

  // 2. Get app details
  server.tool(
    "get_app_details",
    "Get detailed metadata for one or more apps (name, publisher, categories, ratings, etc.)",
    {
      app_ids: z.string().describe("Comma-separated app IDs (max 100)"),
      os: platformEnum.describe("Platform: ios or android"),
    },
    async ({ app_ids, os }: any) => {
      const data = await client.request(`/v1/${os}/apps`, { app_ids });
      return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
    }
  );

  // 3. Sales report estimates (downloads & revenue)
  server.tool(
    "get_sales_estimates",
    "Get download and revenue estimates for apps by country and date range",
    {
      app_ids: z.string().describe("Comma-separated app IDs"),
      os: platformEnum,
      start_date: dateStr.describe("Start date (YYYY-MM-DD)"),
      end_date: dateStr.describe("End date (YYYY-MM-DD)"),
      countries: countryCodes,
      date_granularity: z.enum(["daily", "weekly", "monthly", "quarterly"]).default("monthly").describe("Date granularity"),
    },
    async ({ app_ids, os, start_date, end_date, countries, date_granularity }: any) => {
      const data = await client.request(`/v1/${os}/sales_report_estimates`, {
        app_ids,
        start_date,
        end_date,
        countries,
        date_granularity,
      });
      return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
    }
  );

  // 4. Top ranking apps
  server.tool(
    "get_top_apps",
    "Get top ranking apps for a category and chart type on a specific date",
    {
      os: platformEnum,
      category: z.string().describe("Category ID (e.g. 6014 for Games, 6018 for Books, 36 for All)"),
      date: dateStr.describe("Date (YYYY-MM-DD)"),
      chart_type: z.enum(["topfreeapplications", "toppaidapplications", "topgrossingapplications", "topfreeipadapplications"]).default("topfreeapplications").describe("Chart type"),
      country: z.string().default("US").describe("Country code"),
      limit: z.number().min(1).max(200).default(50).describe("Number of results"),
    },
    async ({ os, category, chart_type, country, date, limit }: any) => {
      const data = await client.request(`/v1/${os}/ranking`, {
        category,
        chart_type,
        country,
        date,
        limit,
      });
      return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
    }
  );

  // 5. Category ranking history
  server.tool(
    "get_category_ranking_history",
    "Get historical category ranking for an app",
    {
      app_id: z.string().describe("App ID"),
      os: platformEnum,
      category: z.string().optional().describe("Category ID"),
      chart_type: z.string().default("topfreeapplications").describe("Chart type"),
      countries: countryCodes.default("US"),
      start_date: dateStr.describe("Start date"),
      end_date: dateStr.describe("End date"),
    },
    async ({ app_id, os, category, chart_type, countries, start_date, end_date }: any) => {
      const data = await client.request(`/v1/${os}/category/category_history`, {
        app_id,
        category,
        chart_type,
        countries,
        start_date,
        end_date,
      });
      return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
    }
  );

  // 6. Top apps comparison (downloads/revenue leaderboard)
  server.tool(
    "get_top_apps_comparison",
    "Get top apps by downloads or revenue with growth metrics",
    {
      os: platformEnum,
      date: dateStr.describe("Reference date (YYYY-MM-DD)"),
      time_range: z.enum(["day", "week", "month", "quarter"]).default("month").describe("Time range for comparison"),
      category: z.string().default("0").describe("Category ID (0 for all)"),
      device_type: z.enum(["iphone", "ipad", "total"]).default("total").describe("Device type"),
      countries: countryCodes.default("US"),
      comparison_attribute: z.enum(["absolute", "delta", "percent"]).default("absolute").describe("Comparison type"),
      measure: z.enum(["units", "revenue"]).default("units").describe("Measure type: units (downloads) or revenue"),
      limit: z.number().min(1).max(200).default(50).describe("Number of results"),
    },
    async ({ os, date, time_range, category, device_type, countries, comparison_attribute, measure, limit }: any) => {
      const data = await client.request(`/v1/${os}/sales_report_estimates_comparison_attributes`, {
        date,
        time_range,
        category,
        device_type,
        countries,
        comparison_attribute,
        measure,
        limit,
      });
      return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
    }
  );

  // 7. App reviews
  server.tool(
    "get_reviews",
    "Get user reviews for an app with ratings, content, and version info",
    {
      app_id: z.string().describe("App ID"),
      os: platformEnum,
      countries: countryCodes,
      start_date: dateStr.optional().describe("Filter reviews from this date"),
      end_date: dateStr.optional().describe("Filter reviews until this date"),
      rating: z.number().min(1).max(5).optional().describe("Filter by star rating"),
      limit: z.number().min(1).max(200).default(50).describe("Number of reviews"),
      offset: z.number().default(0).describe("Pagination offset"),
    },
    async ({ app_id, os, countries, start_date, end_date, rating, limit, offset }: any) => {
      const data = await client.request(`/v1/${os}/review/get_reviews`, {
        app_id,
        countries,
        start_date,
        end_date,
        rating,
        limit,
        offset,
      });
      return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
    }
  );

  // 8. Ratings history
  server.tool(
    "get_ratings",
    "Get historical rating breakdown for an app",
    {
      app_id: z.string().describe("App ID"),
      os: platformEnum,
      countries: countryCodes.default("US"),
    },
    async ({ app_id, os, countries }: any) => {
      const data = await client.request(`/v1/${os}/review/get_ratings`, {
        app_id,
        countries,
      });
      return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
    }
  );

  // 9. Active users (usage intelligence)
  server.tool(
    "get_active_users",
    "Get active user estimates (DAU/WAU/MAU) for apps",
    {
      app_ids: z.string().describe("Comma-separated app IDs"),
      os: platformEnum,
      start_date: dateStr.describe("Start date"),
      end_date: dateStr.describe("End date"),
      countries: countryCodes.default("US"),
      date_granularity: z.enum(["daily", "weekly", "monthly", "quarterly"]).default("monthly").describe("Date granularity"),
      time_period: z.enum(["day", "week", "month"]).default("month").describe("Active user period: day (DAU), week (WAU), month (MAU)"),
    },
    async ({ app_ids, os, start_date, end_date, countries, date_granularity, time_period }: any) => {
      const data = await client.request(`/v1/${os}/usage/active_users`, {
        app_ids,
        start_date,
        end_date,
        countries,
        date_granularity,
        time_period,
      });
      return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
    }
  );

  // 10. Retention
  server.tool(
    "get_retention",
    "Get retention metrics (D1 through D90) for apps",
    {
      app_ids: z.string().describe("Comma-separated app IDs"),
      os: platformEnum,
      start_date: dateStr.describe("Start date"),
      end_date: dateStr.describe("End date"),
      countries: countryCodes.default("US"),
      date_granularity: z.enum(["all_time", "quarterly"]).default("all_time").describe("Granularity"),
    },
    async ({ app_ids, os, start_date, end_date, countries, date_granularity }: any) => {
      const data = await client.request(`/v1/${os}/usage/retention`, {
        app_ids,
        start_date,
        end_date,
        countries,
        date_granularity,
      });
      return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
    }
  );

  // 11. Demographics
  server.tool(
    "get_demographics",
    "Get user demographics (age and gender breakdown) for apps",
    {
      app_ids: z.string().describe("Comma-separated app IDs"),
      os: platformEnum,
      start_date: dateStr.describe("Start date"),
      end_date: dateStr.describe("End date"),
      countries: countryCodes.default("US"),
    },
    async ({ app_ids, os, start_date, end_date, countries }: any) => {
      const data = await client.request(`/v1/${os}/usage/demographics`, {
        app_ids,
        start_date,
        end_date,
        countries,
      });
      return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
    }
  );

  // 12. Keyword research
  server.tool(
    "research_keyword",
    "Get detailed keyword information with traffic, difficulty, and ranking apps",
    {
      term: z.string().describe("Keyword to research"),
      os: platformEnum,
      country: z.string().default("US").describe("Country code"),
    },
    async ({ term, os, country }: any) => {
      const data = await client.request(`/v1/${os}/keywords/research_keyword`, {
        term,
        country,
      });
      return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
    }
  );

  // 13. App keywords
  server.tool(
    "get_app_keywords",
    "Get keywords that an app currently ranks for",
    {
      app_id: z.string().describe("App ID"),
      os: platformEnum,
      country: z.string().default("US").describe("Country code"),
    },
    async ({ app_id, os, country }: any) => {
      const data = await client.request(`/v1/${os}/keywords/get_current_keywords`, {
        app_id,
        country,
      });
      return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
    }
  );

  // 14. Trending searches (iOS only)
  server.tool(
    "get_trending_searches",
    "Get currently trending search terms on the iOS App Store",
    {
      country: z.string().default("US").describe("Country code"),
    },
    async ({ country }: any) => {
      const data = await client.request(`/v1/ios/keywords/trending_searches`, {
        country,
      });
      return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
    }
  );

  // 15. Ad intelligence - creatives
  server.tool(
    "get_ad_creatives",
    "Get ad creatives for apps with Share of Voice data (requires Ad Intelligence plan)",
    {
      app_ids: z.string().describe("Comma-separated app IDs (max 5)"),
      os: platformEnum,
      start_date: dateStr.describe("Start date"),
      end_date: dateStr.describe("End date"),
      countries: countryCodes,
      ad_type: z.enum(["display", "video", "playable"]).optional().describe("Ad type filter"),
      limit: z.number().min(1).max(100).default(20).describe("Number of results"),
    },
    async ({ app_ids, os, start_date, end_date, countries, ad_type, limit }: any) => {
      const data = await client.request(`/v1/${os}/ad_intel/creatives`, {
        app_ids,
        start_date,
        end_date,
        countries,
        ad_type,
        limit,
      });
      return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
    }
  );

  // 16. Ad intelligence - network analysis (SOV)
  server.tool(
    "get_ad_network_analysis",
    "Get Share of Voice time series for apps across ad networks (requires Ad Intelligence plan)",
    {
      app_ids: z.string().describe("Comma-separated app IDs (max 5)"),
      os: platformEnum,
      start_date: dateStr.describe("Start date"),
      end_date: dateStr.describe("End date"),
      countries: countryCodes,
      date_granularity: z.enum(["daily", "weekly", "monthly"]).default("monthly").describe("Date granularity"),
    },
    async ({ app_ids, os, start_date, end_date, countries, date_granularity }: any) => {
      const data = await client.request(`/v1/${os}/ad_intel/network_analysis`, {
        app_ids,
        start_date,
        end_date,
        countries,
        date_granularity,
      });
      return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
    }
  );

  // 17. Top publishers
  server.tool(
    "get_top_publishers",
    "Get top publishers by downloads or revenue with growth metrics",
    {
      os: platformEnum,
      date: dateStr.describe("Reference date (YYYY-MM-DD)"),
      time_range: z.enum(["day", "week", "month", "quarter"]).default("month").describe("Time range"),
      category: z.string().optional().describe("Category ID"),
      countries: countryCodes.default("US"),
      measure: z.enum(["units", "revenue"]).default("units").describe("Measure type"),
      limit: z.number().min(1).max(200).default(50).describe("Number of results"),
    },
    async ({ os, date, time_range, category, countries, measure, limit }: any) => {
      const data = await client.request(`/v1/${os}/top_and_trending/publishers`, {
        date,
        time_range,
        category,
        countries,
        measure,
        limit,
      });
      return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
    }
  );

  // 18. Publisher apps
  server.tool(
    "get_publisher_apps",
    "Get all apps for a publisher",
    {
      publisher_id: z.string().describe("Publisher ID"),
      os: platformEnum,
    },
    async ({ publisher_id, os }: any) => {
      const data = await client.request(`/v1/${os}/publisher/publisher_apps`, {
        publisher_id,
      });
      return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
    }
  );

  // 19. Featured apps
  server.tool(
    "get_featured_apps",
    "Get apps featured on App Store (iOS) or Play Store (Android)",
    {
      os: platformEnum,
      country: z.string().default("US").describe("Country code"),
      start_date: dateStr.optional().describe("Start date"),
      end_date: dateStr.optional().describe("End date"),
    },
    async ({ os, country, start_date, end_date }: any) => {
      const data = await client.request(`/v1/${os}/featured/apps`, {
        country,
        start_date,
        end_date,
      });
      return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
    }
  );

  // 20. Download sources
  server.tool(
    "get_download_sources",
    "Get download percentages by source (organic, paid, browser) for an app",
    {
      app_ids: z.string().describe("Comma-separated app IDs"),
      os: platformEnum,
      start_date: dateStr.describe("Start date"),
      end_date: dateStr.describe("End date"),
      countries: countryCodes.default("US"),
    },
    async ({ app_ids, os, start_date, end_date, countries }: any) => {
      const data = await client.request(`/v1/${os}/downloads_by_sources`, {
        app_ids,
        start_date,
        end_date,
        countries,
      });
      return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
    }
  );

  // 21. Top in-app purchases (iOS)
  server.tool(
    "get_top_iap",
    "Get top in-app purchases for an iOS app",
    {
      app_id: z.string().describe("iOS App ID"),
    },
    async ({ app_id }: any) => {
      const data = await client.request(`/v1/ios/apps/top_in_app_purchases`, {
        app_id,
      });
      return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
    }
  );

  // 22. Unified app ID mapping
  server.tool(
    "get_unified_apps",
    "Map between unified, iOS, and Android app IDs",
    {
      app_ids: z.string().describe("Comma-separated app IDs (max 100)"),
      app_id_type: z.enum(["unified", "itunes", "android"]).default("unified").describe("Type of app IDs provided"),
    },
    async ({ app_ids, app_id_type }: any) => {
      const data = await client.request(`/v1/unified/apps`, { app_ids, app_id_type });
      return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
    }
  );

  // 23. Apple Search Ads
  server.tool(
    "get_search_ads_apps",
    "Get apps running Search Ads for a keyword (iOS only)",
    {
      term: z.string().describe("Keyword to check"),
      country: z.string().default("US").describe("Country code"),
    },
    async ({ term, country }: any) => {
      const data = await client.request(`/v1/ios/search_ads/apps`, {
        term,
        country,
      });
      return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
    }
  );

  // 24. API usage
  server.tool(
    "get_api_usage",
    "Check your SensorTower API usage stats",
    {},
    async () => {
      const data = await client.request(`/v1/api_usage`);
      return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
    }
  );
}
