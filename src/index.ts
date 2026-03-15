#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import express from "express";
import { config } from "dotenv";
import { SensorTowerClient } from "./sensortower-client.js";
import { registerTools } from "./tools.js";
import { randomUUID } from "crypto";

config();

const API_KEY = process.env.SENSORTOWER_API_KEY;

if (!API_KEY) {
  console.error("Error: SENSORTOWER_API_KEY environment variable is required");
  process.exit(1);
}

const TRANSPORT = process.env.MCP_TRANSPORT || "stdio";
const PORT = parseInt(process.env.PORT || "3000", 10);

function createServer() {
  const server = new McpServer({
    name: "sensortower",
    version: "1.0.0",
    description:
      "SensorTower MCP server for app store intelligence — search apps, get download/revenue estimates, reviews, keywords, ad intelligence, and more.",
  });
  const client = new SensorTowerClient(API_KEY!);
  registerTools(server, client);
  return server;
}

async function runStdio() {
  const server = createServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("SensorTower MCP server running on stdio");
}

async function runHTTP() {
  const app = express();
  app.use(express.json());

  // --- SSE transport ---
  const sseSessions = new Map<string, SSEServerTransport>();

  app.get("/sse", async (req, res) => {
    const transport = new SSEServerTransport("/messages", res);
    sseSessions.set(transport.sessionId, transport);

    transport.onclose = () => {
      sseSessions.delete(transport.sessionId);
    };

    const server = createServer();
    await server.connect(transport);
  });

  app.post("/messages", async (req, res) => {
    const sessionId = req.query.sessionId as string;
    const transport = sseSessions.get(sessionId);
    if (!transport) {
      res.status(400).json({ error: "Invalid or missing session ID" });
      return;
    }
    await transport.handlePostMessage(req, res, req.body);
  });

  // --- Streamable HTTP transport ---
  const httpSessions = new Map<string, StreamableHTTPServerTransport>();

  app.post("/mcp", async (req, res) => {
    const sessionId = req.headers["mcp-session-id"] as string | undefined;

    if (sessionId && httpSessions.has(sessionId)) {
      const transport = httpSessions.get(sessionId)!;
      await transport.handleRequest(req, res, req.body);
      return;
    }

    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => randomUUID(),
    });

    transport.onclose = () => {
      const sid = transport.sessionId;
      if (sid) httpSessions.delete(sid);
    };

    const server = createServer();
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);

    if (transport.sessionId) {
      httpSessions.set(transport.sessionId, transport);
    }
  });

  app.get("/mcp", async (req, res) => {
    const sessionId = req.headers["mcp-session-id"] as string | undefined;
    if (!sessionId || !httpSessions.has(sessionId)) {
      res.status(400).json({ error: "Invalid or missing session ID" });
      return;
    }
    await httpSessions.get(sessionId)!.handleRequest(req, res);
  });

  app.delete("/mcp", async (req, res) => {
    const sessionId = req.headers["mcp-session-id"] as string | undefined;
    if (!sessionId || !httpSessions.has(sessionId)) {
      res.status(400).json({ error: "Invalid or missing session ID" });
      return;
    }
    const transport = httpSessions.get(sessionId)!;
    await transport.handleRequest(req, res);
    httpSessions.delete(sessionId);
  });

  // --- Health ---
  app.get("/health", (_req, res) => {
    res.json({ status: "ok", transports: ["sse", "streamable-http"] });
  });

  app.listen(PORT, "0.0.0.0", () => {
    console.error(`SensorTower MCP server running on http://0.0.0.0:${PORT}`);
    console.error(`  SSE:             GET  /sse`);
    console.error(`  Streamable HTTP: POST /mcp`);
  });
}

async function main() {
  if (TRANSPORT === "http") {
    await runHTTP();
  } else {
    await runStdio();
  }
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
