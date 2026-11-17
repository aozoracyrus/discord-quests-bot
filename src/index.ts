import { config as dotenvConfig } from "dotenv";
dotenvConfig(); // ← THÊM: Load .env trước khi import module khác

import { initializeDatabase } from './providers/appDataSource.js';
import botClient from "./providers/client.js";

export const AppDataSource = await initializeDatabase();
export const client = botClient;
