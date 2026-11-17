import { SupportedDatabaseTypes } from "../core/databaseConfig.js";
import { config as dotenvConfig } from "dotenv";
import { Config } from "../interface/config.js";

dotenvConfig();

// Đọc biến môi trường an toàn
const env = (key: string, fallback: string = ""): string =>
  process.env[key]?.trim() || fallback;

export default {
  // Token bot Discord chính thức
  token: env("DISCORD_TOKEN"),

  // Màu embed mặc định
  embedColor: "#06c2fb",

  // Ngôn ngữ mặc định: Tiếng Việt
  defaultLanguage: env("DEFAULT_LANGUAGE", "vi"),

  // Chế độ debug
  debugMode: process.env.DEBUG === "true",

  // Prefix cho message command
  prefix: "!",

  // Danh sách developer
  developers: ["527826654660132890"],

  // Server chính (chỉ để gửi log, KHÔNG ép user vào)
  mainServerId: env("MAIN_SERVER_ID", "1399471603003428966"),

  // Cấu hình database - giữ MongoDB Atlas
  database: {
    type: SupportedDatabaseTypes.MongoDB,
    url: env("MONGO_URI", "mongodb://localhost:27017/badge2"),
  },
} as Config;
