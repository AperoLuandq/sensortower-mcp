#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import express from "express";
import { config } from "dotenv";
import { SensorTowerClient } from "./sensortower-client.js";
import { registerTools } from "./tools.js";

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

async function runSSE() {
  const app = express();
  app.use(express.json());

  const sessions = new Map<string, SSEServerTransport>();

  // SSE endpoint - client connects here to establish the stream
  app.get("/sse", async (req, res) => {
    const transport = new SSEServerTransport("/messages", res);
    sessions.set(transport.sessionId, transport);

    transport.onclose = () => {
      sessions.delete(transport.sessionId);
    };

    const server = createServer();
    await server.connect(transport);
  });

  // Messages endpoint - client sends JSON-RPC messages here
  app.post("/messages", async (req, res) => {
    const sessionId = req.query.sessionId as string;
    const transport = sessions.get(sessionId);
    if (!transport) {
      res.status(400).json({ error: "Invalid or missing session ID" });
      return;
    }
    await transport.handlePostMessage(req, res, req.body);
  });

  app.get("/health", (_req, res) => {
    res.json({ status: "ok", transport: "sse" });
  });

  app.listen(PORT, "0.0.0.0", () => {
    console.error(`SensorTower MCP server running on http://0.0.0.0:${PORT}/sse`);
  });
}

async function main() {
  if (TRANSPORT === "http") {
    await runSSE();
  } else {
    await runStdio();
  }
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
