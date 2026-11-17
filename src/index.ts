import { config as dotenvConfig } from "dotenv";
dotenvConfig(); // Load biến môi trường

import { initializeDatabase } from './providers/appDataSource.js';
import botCLient from "./providers/client.js";
import express from "express";

// Khởi tạo database và bot
export const AppDataSource = await initializeDatabase();
export const client = botCLient;

// === KEEP-ALIVE HTTP SERVER (BẮT BUỘC CHO RENDER FREE) ===
const keep = express();

// Endpoint chính
keep.get("/", (_req, res) => {
  res.status(200).send("✅ Bot Discord Quest đang hoạt động!");
});

// Endpoint health check cho Render
keep.get("/healthz", (_req, res) => {
  res.status(200).json({ 
    ok: true, 
    uptime: process.uptime(),
    timestamp: new Date().toISOString()
  });
});

// Lắng nghe trên cổng Render cung cấp
const PORT = process.env.PORT || 10000;
keep.listen(Number(PORT), "0.0.0.0", () => {
  console.log(`[KeepAlive] ✅ HTTP server đang chạy trên cổng ${PORT}`);
  console.log(`[KeepAlive] ✅ Bot sẵn sàng nhận request tại /healthz`);
});
