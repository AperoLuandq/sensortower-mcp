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
    `Search for apps or publishers by name. This is typically the FIRST step in any workflow — use it to find app_ids needed by other tools.

Returns: matching apps/publishers with their IDs and basic info.

Important: os defaults to "unified", which returns unified IDs. Most other tools require platform-specific IDs (ios/android). Either set os to "ios" or "android" when searching, or use get_unified_apps afterward to convert unified IDs to platform-specific ones.

Use cases:
- Find app IDs before calling get_app_details, get_sales_estimates, etc.
- Search for publishers to get their publisher_id for get_publisher_apps
- Quick lookup to verify app names and platforms

Example: search "TikTok" with os="ios" → returns iOS app_id that you pass to get_sales_estimates`,
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
    `Get detailed metadata for one or more apps. Returns: name, publisher, icon, description, categories, current rating, rating count, release date, last update, price, content rating, and platform-specific details.

Accepts up to 100 comma-separated app_ids per call. Requires platform-specific IDs (ios or android).
Prerequisite: Use search_apps first to find app_ids. If search_apps returns unified IDs, use get_unified_apps to convert to platform-specific IDs first.

Use when: user asks "tell me about this app", "what category is X", "when was X last updated", or needs basic app info before deeper analysis.`,
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
    `Get estimated downloads and revenue for apps, broken down by country and time period. These are Sensor Tower's modeled estimates, not official reported figures.

Returns: time series of download counts and revenue amounts per app per country.
Supports daily/weekly/monthly/quarterly granularity. Use "WW" for worldwide aggregated data.

Use when: "how many downloads does X have", "what's X revenue", "compare downloads between App A and App B", or needs market sizing data.`,
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
    `Get the app store top charts (ranking list) for a specific category, chart type, country, and date. Mirrors what users see in the App Store / Play Store rankings.

Common category IDs: 36=All, 6014=Games, 6018=Books, 6015=Finance, 6017=Health & Fitness, 6016=Lifestyle, 6005=Social Networking.
Chart types: topfreeapplications (free), toppaidapplications (paid), topgrossingapplications (top grossing), topfreeipadapplications (iPad free, iOS only).

Returns: ordered list of apps with ranking data.

Use when: "What are the top free games in the US?", "Show me top grossing apps", "What's #1 in the App Store right now?"
Prefer get_top_apps_comparison when user wants volume-based rankings with growth data instead of store chart rankings.`,
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
    `Track how an app's category ranking has changed over time. Returns a time series of ranking positions within a specific category and chart type.

Useful for: monitoring rank trends, detecting rank spikes from marketing campaigns, comparing competitive positioning over time.

Prerequisite: Need app_id (from search_apps). category is optional — if omitted, uses the app's primary category.
Common category IDs: 36=All, 6014=Games, 6018=Books, 6015=Finance.

Use when: "How has TikTok's ranking changed?", "Show me rank history for X", "Did the app's ranking improve after the update?"`,
    {
      app_id: z.string().describe("App ID"),
      os: platformEnum,
      category: z.string().optional().describe("Category ID"),
      chart_type: z.string().default("topfreeapplications").describe("Chart type: topfreeapplications, toppaidapplications, topgrossingapplications, topfreeipadapplications (iOS only)"),
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
    `Get top apps ranked by absolute downloads/revenue WITH growth comparison metrics. Unlike get_top_apps (which shows store chart rankings), this tool ranks by actual estimated download/revenue volume and includes period-over-period growth data.

comparison_attribute controls the sort:
- "absolute": rank by total downloads/revenue in the period
- "delta": rank by numeric change vs previous period
- "percent": rank by percentage growth vs previous period

device_type: filter by "iphone", "ipad", or "total" (default). Only meaningful when os is "ios" — ignored for Android.
category: use "0" for all categories (unlike get_top_apps which uses "36" for All).

Returns: app list with download/revenue numbers AND growth metrics.

Use when: "Which apps grew fastest this month?", "Top apps by revenue with growth", "What apps had the biggest download increase?"
Prefer get_top_apps when user wants store chart rankings.`,
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
    `Get user reviews for an app, including review text, star rating, app version, author name, and review date. Supports filtering by country, date range, and star rating.

Returns reviews sorted by most recent first. Use pagination (offset) for more results. Default 50, max 200 reviews per call.

Different from get_ratings: this returns individual review texts, while get_ratings gives aggregate rating stats.

Use when: "What are users saying about X?", "Show me 1-star reviews", "What complaints do users have about the latest version?"`,
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
    `Get the star rating distribution (1 through 5 star counts) and average rating for an app.

Returns: count of reviews per star level (1-5), total review count, average rating.

Different from get_reviews: this gives aggregate rating stats, while get_reviews returns individual review texts.

Use when: "What's the rating breakdown for X?", "How many 5-star reviews does X have?", "Compare average ratings between App A and App B"`,
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
    `Get estimated active user counts (DAU/WAU/MAU) for apps over a date range. These are Sensor Tower's modeled estimates based on panel data.

Key parameters:
- time_period: defines the metric — "day"=DAU, "week"=WAU, "month"=MAU
- date_granularity: how data points are spaced (daily/weekly/monthly/quarterly)

Returns: time series of active user counts per app per country.

Use when: "How many daily active users does X have?", "What's X's MAU?", "Compare user engagement between App A and App B"`,
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
    `Get user retention rates (percentage of users who return after install) for apps. These are Sensor Tower estimates based on panel data.

Retention = % of new users who open the app again N days after first install.
Supports "all_time" (single aggregate) or "quarterly" date_granularity.

Returns: retention percentages per app.

Use when: "What's the D1 retention for X?", "How sticky is this app?", "Compare retention rates between competitors"`,
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
    `Get estimated user demographics for apps, broken down by age group and gender. Based on Sensor Tower's panel data modeling.

Returns: percentage breakdown by age brackets (e.g., 18-24, 25-34, 35-44, 45-54, 55+) and gender (male/female) for each app.

Use when: "Who uses this app?", "What's the age breakdown of X's users?", "Is App X more popular with men or women?", targeting analysis.`,
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
    `Research an App Store Optimization (ASO) keyword: get search volume/traffic score, keyword difficulty score, and the list of apps currently ranking for that keyword.

Returns: traffic score (relative search volume), difficulty score (competition level), and top-ranking apps for the keyword in the specified country.

Use when: "How competitive is the keyword 'photo editor'?", "What apps rank for X?", "Is this keyword worth targeting for ASO?", keyword research for app marketing.`,
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
    `Get all keywords that an app currently ranks for in App Store / Play Store search, along with the app's ranking position and each keyword's traffic score.

Useful for ASO analysis: understanding what search terms drive discovery for an app.
Combine with research_keyword for deeper analysis on specific terms.

Use when: "What keywords does X rank for?", "Show me X's ASO keyword profile", "Find keyword opportunities by analyzing competitor keywords"`,
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
    `Get currently trending search terms on the iOS App Store (iOS ONLY — not available for Android). Shows what users are actively searching for right now.

Returns: list of trending keywords with their current rank/position.

Use when: "What's trending on the App Store?", "What are people searching for?", "Find trending topics for app marketing inspiration"
Note: iOS only — no Android equivalent for trending searches.`,
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
    `Get advertising creatives (display, video, playable ads) used by apps, along with Share of Voice (SOV) metrics. SOV = relative proportion of ad impressions vs competitors.

Requires Ad Intelligence plan — will fail without it. Recommended max 5 app_ids per call.

Returns: ad creative details (type, preview), SOV data, and ad network info.
Combine with get_ad_network_analysis for complete competitive ad intelligence.

Use when: "What ads is X running?", "Show me competitor ad creatives", "What's X's share of voice?", competitive ad intelligence research.`,
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
    `Get Share of Voice (SOV) trends over time, broken down by ad network (Facebook, Google Ads, Unity, AppLovin, etc.). Shows how an app's advertising presence changes across different networks.

Requires Ad Intelligence plan — will fail without it. Recommended max 5 app_ids per call.

Returns: time series of SOV percentages per ad network per app.
Combine with get_ad_creatives for complete competitive ad intelligence.

Use when: "Which ad networks does X use?", "How has X's ad spend shifted over time?", "Compare ad strategies between competitors across networks"`,
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
    `Get top app publishers (companies/developers) ranked by total downloads or revenue across all their apps, with growth metrics.

Returns: publisher name, publisher_id, total downloads/revenue, growth numbers.
Different from get_top_apps_comparison (which ranks individual apps).
Use publisher_id with get_publisher_apps to see all apps from a publisher.

Use when: "Who are the biggest app publishers?", "Top gaming companies by revenue", "Which publishers grew fastest this quarter?"`,
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
    `Get the complete list of apps published by a specific publisher/developer.

Prerequisite: Need publisher_id — get it from search_apps (entity_type: "publisher") or from get_top_publishers results.

Returns: list of all apps with app_id, name, category, and basic metrics.

Use when: "What apps does Company X publish?", "Show me all games from Publisher Y", "How many apps does this developer have?"`,
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
    `Get apps that are currently or were recently featured (editor's choice, app of the day, etc.) on App Store or Play Store.

Returns: featured apps with featuring type, dates, and placement details.

Use when: "Which apps are featured right now?", "Was X ever featured on the App Store?", "Show me recently featured apps in the US"`,
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
    `Get the breakdown of how users discover and download an app: organic (App Store search), paid (ads), browser (web referral), and other sources.

Returns: percentage breakdown of download sources per app.
Useful for understanding user acquisition strategy and marketing ROI.

Use when: "How do users find this app?", "What % of downloads are organic vs paid?", "Is X relying heavily on paid acquisition?"`,
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
    `Get the most popular in-app purchases (IAPs) for an iOS app (iOS ONLY). Shows what users are buying inside the app.

Returns: IAP names, prices, and relative popularity/ranking.
Note: Only available for iOS apps. Uses iOS App ID (not unified ID).

Use when: "What do users buy in this app?", "What are the top IAPs?", "Analyze monetization strategy of X"`,
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
    `Convert between Sensor Tower's unified app IDs and platform-specific IDs (iTunes/iOS App ID or Android package name). Sensor Tower uses "unified IDs" to represent an app across both platforms as a single entity.

Use this when:
- You have a unified ID but need the iOS or Android ID for platform-specific tools
- You have an iTunes ID and need the unified or Android equivalent
- You need to link iOS and Android versions of the same app

Essential utility tool — many tools require platform-specific IDs while search_apps may return unified IDs.`,
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
    `Get the list of apps currently running Apple Search Ads for a specific keyword (iOS App Store ONLY). Shows which competitors are bidding on a keyword.

Returns: apps running ads for the keyword with SOV/impression data.

Use when: "Who's advertising on the keyword 'fitness tracker'?", "Is any competitor bidding on our brand keyword?", competitive Apple Search Ads intelligence.`,
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
    `Check current API usage and remaining quota for your Sensor Tower account. No parameters needed.

Returns: calls made, calls remaining, quota limits, and plan details.

Use when: monitoring API consumption, checking if approaching limits, or debugging "quota exceeded" errors from other tools.`,
    {},
    async () => {
      const data = await client.request(`/v1/api_usage`);
      return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
    }
  );
}
