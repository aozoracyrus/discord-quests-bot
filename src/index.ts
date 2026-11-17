import { config as dotenvConfig } from "dotenv";
dotenvConfig();

import express from "express";

console.log("[DEBUG] Bắt đầu khởi tạo...");
console.log("[DEBUG] DISCORD_TOKEN:", process.env.DISCORD_TOKEN ? "✅ Có" : "❌ Thiếu");
console.log("[DEBUG] MONGO_URI:", process.env.MONGO_URI ? "✅ Có" : "❌ Thiếu");

import { initializeDatabase } from './providers/appDataSource.js';
import botCLient from "./providers/client.js";

console.log("[DEBUG] Đang kết nối database...");
export const AppDataSource = await initializeDatabase();
console.log("[DEBUG] Database đã kết nối thành công!");

export const client = botCLient;
console.log("[DEBUG] Bot client đã sẵn sàng, đang đăng nhập Discord...");

// === KEEP-ALIVE HTTP SERVER (BẮT BUỘC CHO RENDER FREE) ===
const keep = express();

keep.get("/", (_req, res) => {
  res.status(200).send("✅ Bot Discord Quest đang hoạt động!");
});

keep.get("/healthz", (_req, res) => {
  res.status(200).json({ 
    ok: true, 
    uptime: process.uptime(),
    timestamp: new Date().toISOString()
  });
});

const PORT = process.env.PORT || 10000;
keep.listen(Number(PORT), "0.0.0.0", () => {
  console.log(`[KeepAlive] ✅ HTTP server đang chạy trên cổng ${PORT}`);
  console.log(`[KeepAlive] ✅ Bot sẵn sàng nhận request tại /healthz`);
});
