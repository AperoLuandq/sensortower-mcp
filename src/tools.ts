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
    `Search for apps or publishers by name. This is the ENTRY POINT for most workflows — use it first to find app_ids needed by other tools.

Returns array of objects: { app_id, name, publisher_name, publisher_id, humanized_name, icon_url, os, categories, global_rating_count, release_date, updated_date, active, valid_countries }.

Important: os defaults to "unified", which returns unified IDs. Most other tools require platform-specific IDs (ios/android). Either set os to "ios" or "android" when searching, or use get_unified_apps afterward to convert unified IDs to platform-specific ones.

Workflow: search_apps → get app_id → pass to get_app_details, get_sales_estimates, get_reviews, etc.
Use entity_type="publisher" to find publisher_id for get_publisher_apps.

Use when: "Find app X", "Look up app ID for Y", "Search for apps like Z", or as a first step before any app-specific analysis.`,
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
    `Get detailed metadata for one or more apps. Accepts up to 100 comma-separated app_ids per call.

Returns { apps: [{ app_id, name, publisher_name, publisher_id, icon_url, os, url, categories, release_date, updated_date, rating, price, global_rating_count, rating_count, version, in_app_purchases, humanized_worldwide_last_month_downloads, humanized_worldwide_last_month_revenue, bundle_id, support_url, website_url, privacy_policy_url, publisher_country, content_rating, unified_app_id, description, subtitle, screenshot_urls, supported_languages }] }

Requires platform-specific IDs (ios or android).
Prerequisite: Use search_apps first to find app_ids. If search_apps returns unified IDs, use get_unified_apps to convert to platform-specific IDs first.

Use when: "tell me about this app", "what category is X", "when was X last updated", "show me X's screenshots", or need comprehensive app metadata.`,
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
    `Get estimated downloads and revenue for apps, broken down by country and time period. These are Sensor Tower modeled estimates, not official figures.

Returns array of objects: { aid (app_id), cc (country_code), d (date), au (android_units/downloads), ar (android_revenue), iu (ios_units/downloads), ir (ios_revenue) }. Revenue values are in the smallest currency unit (e.g. cents for USD — divide by 100 for dollars).

Supports daily/weekly/monthly/quarterly granularity. Use "WW" for countries param to get worldwide data.

Use when: "How many downloads does X have?", "What's X's monthly revenue?", "Compare downloads between App A and B", "Revenue trend over time".`,
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
    `Get the App Store / Play Store top chart rankings for a specific category, chart type, country, and date. Returns the same rankings users see in the store.

Returns { category, chart_type, country, date, ranking: [app_id, app_id, ...] } — an ordered array of app IDs by rank position. You'll need to call get_app_details separately to get app names/metadata.

Common iOS category IDs: 36=All, 6014=Games, 6017=Education, 6018=Books, 6015=Finance, 6016=Lifestyle, 6005=Social Networking, 6007=Productivity, 6002=Utilities, 6008=Photo & Video.
Chart types: topfreeapplications, toppaidapplications, topgrossingapplications, topfreeipadapplications (iOS only).

DIFFERENT from get_top_apps_comparison: This returns store chart rankings (position-based). Use get_top_apps_comparison for volume-based rankings with growth metrics.

Use when: "What's #1 in the App Store?", "Top free games in US", "Show me the top grossing apps".`,
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
    `Track how an app's position in category rankings has changed over time. Returns daily ranking positions within a specific category chart.

Note: Both category and chart_type may be required for successful requests. If the API returns error 400, verify that a valid category ID is provided. category param is optional in schema but recommended to always provide.

Prerequisite: Need app_id from search_apps.
Common iOS category IDs: 36=All, 6014=Games, 6017=Education, 6018=Books, 6015=Finance.

Use when: "How has X's ranking changed?", "Show rank history for X", "Did the ranking improve after the campaign?", competitive rank monitoring.`,
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
    `Get top apps ranked by absolute download/revenue volume WITH period-over-period growth comparison. Unlike get_top_apps (store chart positions), this ranks by actual estimated volumes.

Returns array of objects: { app_id, date, current_units_value, units_absolute, comparison_units_value, units_delta, units_transformed_delta (% change), current_revenue_value, revenue_absolute, comparison_revenue_value, revenue_delta, revenue_transformed_delta (% change), custom_tags: { extensive metadata including retention, demographics, DAU/MAU, download sources, SDK info } }

comparison_attribute controls sorting: "absolute" = rank by total volume, "delta" = by numeric change, "percent" = by growth rate.
measure: "units" = downloads, "revenue" = revenue.
device_type: "iphone", "ipad", or "total" (default). Only meaningful when os is "ios" — ignored for Android.
category: use "0" for all categories (unlike get_top_apps which uses "36" for All).

DIFFERENT from get_top_apps: This returns volume data + growth. Use get_top_apps for store chart rankings.

Use when: "Which apps grew fastest?", "Top apps by revenue with growth data", "Market leaders by downloads", "Competitive landscape with metrics".`,
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
    `Get individual user reviews for an app with full text, ratings, sentiment analysis, and version info. Supports filtering by country, date range, and star rating.

Returns { feedback: [{ id, date, rating (1-5), country, username, title, version, tags, content, parsed_content, sentiment ("happy"/"mixed"/"sad"), detected_language, app_id }], page_count, total_count, rating_breakdown: [1star, 2star, 3star, 4star, 5star counts] }

Sorted by most recent first. Default 50, max 200 per call. Use offset for pagination.

DIFFERENT from get_ratings: This returns individual review texts with sentiment. get_ratings gives aggregate rating stats only.

Use when: "What are users saying about X?", "Show me 1-star reviews", "Sentiment analysis of user feedback", "What complaints about latest version?".`,
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
    `Get the star rating distribution and average rating for an app. Shows cumulative rating breakdown as of the latest available date.

Returns array: [{ app_id, country, date, breakdown: [1star_count, 2star_count, 3star_count, 4star_count, 5star_count], average, total, current_version_breakdown: [same format] }]

DIFFERENT from get_reviews: This gives aggregate rating stats. get_reviews returns individual review texts with sentiment.

Use when: "What's the rating breakdown?", "How many 5-star reviews?", "Compare average ratings between apps", "Rating distribution analysis".`,
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
    `Get estimated active user counts (DAU/WAU/MAU) for apps over a date range. Sensor Tower modeled estimates based on panel data.

Returns array: [{ app_id, country, date, ipad_users, iphone_users }]. Total active users = ipad_users + iphone_users. Note: response fields are iOS-specific; Android responses may use different field names.

Key parameters:
- time_period: "day" = DAU, "week" = WAU, "month" = MAU (defines the metric)
- date_granularity: how data points are spaced (daily/weekly/monthly/quarterly)

Use "WW" for worldwide. Combine with get_sales_estimates for downloads-to-users conversion analysis.

Use when: "How many daily active users?", "What's X's MAU?", "User engagement trends", "DAU/MAU ratio analysis".`,
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
    `Get user retention rates for apps — the percentage of new users who return N days after install. Returns D0 through D89 (90 data points). Sensor Tower estimates based on panel data.

Returns { app_data: [{ date_granularity, app_id, country, date, corrected_retention: [float array — index 0 = D0, index 1 = D1, ..., index 89 = D89], confidence }], baseline_data: [float array — category average for comparison], disabled_app_ids }

Values are decimals (0.52 = 52%). baseline_data provides category-average retention for benchmarking.
Supports "all_time" (single aggregate) or "quarterly" date_granularity.

Use when: "What's D1 retention?", "How sticky is this app?", "Compare retention vs category average", "Retention curve analysis".`,
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
    `Get estimated user demographics broken down by age group and gender. Based on Sensor Tower panel data modeling.

Returns { app_data: [{ app_id, average_age_total, confidence, country, female (ratio), male (ratio), normalized_demographics: { female_18, female_25, female_35, female_45, female_55, male_18, male_25, male_35, male_45, male_55 } }], baseline_data: { same keys — category averages } }

Age brackets: 18 = 18-24, 25 = 25-34, 35 = 35-44, 45 = 45-54, 55 = 55+. Values are ratios (0.17 = 17%).

Use when: "Who uses this app?", "Age/gender breakdown", "Is it more popular with men or women?", "Target audience analysis", "Compare demographics vs category".`,
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
    `Research an ASO (App Store Optimization) keyword: get search volume, difficulty score, and top-ranking apps for that keyword.

Returns { keyword: { related_queries: [string], term, traffic (1-10 score), phone_apps: { app_list, app_list_size, difficulty (1-10), rank_top_10_likelihood }, tablet_apps: { same structure } } }

traffic score: 1 = very low search volume, 10 = very high.
difficulty score: 1 = easy to rank, 10 = very competitive.

Use when: "How competitive is keyword X?", "What apps rank for this term?", "Is this keyword worth targeting?", "ASO keyword research", "Find related keywords".`,
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
    `Get all keywords that an app currently ranks for in App Store / Play Store search results, along with ranking position per keyword.

Returns { app: { full app metadata }, keywords: [{ term, rank }] }

Each keyword entry shows the search term and the app's current rank position for it.
Combine with research_keyword for deeper analysis on specific terms.

Use when: "What keywords does X rank for?", "ASO keyword profile", "Find keyword opportunities from competitors", "Which search terms drive discovery?".`,
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
    `Get currently trending search terms on the iOS App Store. iOS ONLY — not available for Android.

Returns a simple array of strings: ["term1", "term2", "term3", ...] — trending keywords ordered by popularity.

Use when: "What's trending on the App Store?", "What are people searching for right now?", "Trending topics for app marketing", "Content inspiration from search trends".

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
    `Get advertising creatives (display, video, playable ads) used by apps, along with Share of Voice (SOV) metrics showing relative ad impression share.

Requires Ad Intelligence plan — will return error without it. Recommended max 5 app_ids per call.

Returns ad creative details including type, preview URLs, SOV data, and ad network placement info.
Combine with get_ad_network_analysis for complete competitive ad intelligence.

Use when: "What ads is X running?", "Show competitor ad creatives", "What's X's share of voice?", "Competitive ad intelligence".`,
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
    `Get Share of Voice (SOV) trends over time, broken down by ad network (Facebook Ads, Google Ads, Unity, AppLovin, etc.). Shows how an app's advertising presence shifts across networks.

Requires Ad Intelligence plan — will return error without it. Recommended max 5 app_ids per call.

Returns time series of SOV percentages per ad network per app at the specified granularity.
Combine with get_ad_creatives for complete competitive ad intelligence.

Use when: "Which ad networks does X use?", "How has ad strategy shifted?", "Compare ad spend across networks", "Ad network diversification analysis".`,
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
    `Get top app publishers (companies/developers) ranked by total downloads or revenue across ALL their apps, with growth metrics.

Returns array: [{ publisher_id, publisher_name, date, units_absolute, units_delta, revenue_absolute, revenue_delta, apps: [{ app_id, publisher_id, units_absolute, units_delta, units_transformed_delta, revenue_absolute, revenue_delta, revenue_transformed_delta, custom_tags, name, icon_url, os }], units_transformed_delta, revenue_transformed_delta }]

Each publisher entry includes their top apps with individual metrics.
Use publisher_id with get_publisher_apps for the full app portfolio.

DIFFERENT from get_top_apps_comparison: This ranks publishers (companies), not individual apps.

Use when: "Who are the biggest publishers?", "Top gaming companies by revenue", "Which publishers grew fastest?", "Publisher portfolio analysis".`,
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
    `Get the complete list of apps published by a specific publisher/developer on a given platform. Includes both active and inactive (removed) apps.

Returns array of full app objects: [{ app_id, name, publisher_name, publisher_id, icon_url, os, active, url, categories, rating, price, global_rating_count, version, humanized_worldwide_last_month_downloads, humanized_worldwide_last_month_revenue, bundle_id }]

Prerequisite: Need publisher_id — get it from search_apps (entity_type: "publisher") or from get_top_publishers results.

Use when: "What apps does Company X publish?", "Show all games from Publisher Y", "Publisher portfolio analysis", "How many apps does this developer have?".`,
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
    `Get apps that are currently or were recently featured (Editor's Choice, App of the Day, etc.) on App Store or Play Store.

Returns featured apps with featuring details. Optional date range filters for historical featuring data.

Use when: "Which apps are featured right now?", "Was X ever featured?", "Recently featured apps in US", "Feature placement tracking".`,
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
    `Get the breakdown of how users discover and download an app: organic search, organic browse, paid display, paid search, and browser sources. Shows percentage per source.

Returns { data: [breakdown objects per app] }. May return empty data array if source data is not available for the specified app/period.

Use when: "How do users find this app?", "What % of downloads are organic vs paid?", "User acquisition channel analysis", "Is X relying on paid acquisition?".`,
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
    `Get the most popular in-app purchases (IAPs) for an iOS app. iOS ONLY — not available for Android.

Returns { apps: [{ app_id, top_in_app_purchases: [{ iap_id, name, price (string like "$9.99"), duration (ISO 8601 like "P1M" for monthly, "P1Y" for yearly, null for consumables) }] }] }

duration field distinguishes subscriptions (P1M, P1Y) from one-time purchases (null).
Note: Uses iOS App ID (iTunes ID), not unified ID.

Use when: "What do users buy in this app?", "Top IAPs analysis", "Monetization strategy review", "Subscription vs consumable breakdown".`,
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
    `Convert between Sensor Tower's unified app IDs and platform-specific IDs (iTunes/iOS or Android package names). Unified IDs represent an app across both platforms as a single entity.

Returns { apps: [{ unified_app_id, name, canonical_app_id, cohort_id, itunes_apps: [{ app_id }], android_apps: [{ app_id }], unified_publisher_ids, itunes_publisher_ids, android_publisher_ids }] }

Essential utility tool for cross-platform analysis:
- unified → get iOS + Android IDs
- itunes → get unified + Android equivalent
- android → get unified + iOS equivalent

Many tools require platform-specific IDs while search_apps may return unified IDs.

Use when: "Link iOS and Android versions of same app", "Convert unified ID to platform-specific", "Cross-platform app matching", "Need Android package name from iOS ID".`,
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
    `Get apps currently running Apple Search Ads for a specific keyword on iOS App Store. Shows which competitors are bidding on a keyword with their Share of Voice. iOS ONLY.

Returns { apps: [{ app_id, name, publisher_name, icon_url, os, price, rating, release_date, in_app_purchases, rating_count, share_of_voice (0.0-1.0, representing % of ad impressions) }] }

share_of_voice: 0.85 means 85% of ad impressions for this keyword go to this app.

Use when: "Who's advertising on keyword X?", "Competitor Search Ads analysis", "Is anyone bidding on our brand keyword?", "Apple Search Ads competitive intelligence".`,
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
    `Check current API usage and remaining quota for your Sensor Tower account. No parameters required.

Returns usage stats including calls made, remaining quota, and plan details.

Use when: monitoring API consumption, checking quota limits, debugging "quota exceeded" errors, or before running large batch operations.`,
    {},
    async () => {
      const data = await client.request(`/v1/api_usage`);
      return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
    }
  );
}
