import { SupportedDatabaseTypes } from "../core/databaseConfig.js";
import { config as dotenvConfig } from "dotenv";
import { Config } from "../interface/config.js";

dotenvConfig();

const env = (key: string, fallback: string = ""): string =>
  process.env[key]?.trim() || fallback;

// === DEBUG: Log để kiểm tra ===
console.log("[CONFIG] process.env.DISCORD_TOKEN:", process.env.DISCORD_TOKEN ? `${process.env.DISCORD_TOKEN.substring(0, 10)}...` : "undefined");
console.log("[CONFIG] process.env.Token:", process.env.Token ? "có" : "undefined");

export default {
  token: env("DISCORD_TOKEN"),  // ← PHẢI LÀ "DISCORD_TOKEN" (viết hoa hết)
  embedColor: "#06c2fb",
  defaultLanguage: env("DEFAULT_LANGUAGE", "vi"),
  debugMode: process.env.DEBUG === "true",
  prefix: "!",
  developers: ["1160199218313564210"],
  mainServerId: env("MAIN_SERVER_ID", "1399471603003428966"),
  database: {
    type: SupportedDatabaseTypes.MongoDB,
    url: env("MONGO_URI", "mongodb://localhost:27017/badge2"),
  },
} as Config;
