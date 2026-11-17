import cron from "node-cron";
import { Logger } from "./logger.js";
import { AppDataSource } from "../index.js";
import StoredToken, { decodeToken, encodeToken } from "../entities/tokenStore.js";
import { User } from "../lib/quest/User.js";
import { usersCache } from "./cache.js";
import { check_token, getIdFromToken, isValidDiscordToken } from "../utils/quest/tokenUtils.js";
import { ChildManager } from "./ChildManager.js";
import { ProxyInterface } from "../utils/loadProxy.js";
import { client } from "../index.js";
import { TextChannel } from "discord.js";
import questsConfig from "../config/questsConfig.js";

// Repo truy vấn token
const getTokenRepo = () => AppDataSource.getRepo(StoredToken);

/**
 * Phân tích chuỗi proxy "ip:port:user:pass" thành object
 */
const parseProxyString = (raw: string): ProxyInterface | undefined => {
  if (!raw) return undefined;
  const parts = raw.split(":");
  if (parts.length !== 4) return undefined;
  return {
    ip: `${parts[0]}:${parts[1]}`,
    authentication: `${parts[2]}:${parts[3]}`,
  };
};

/**
 * Lưu hoặc cập nhật token vào database
 */
export async function saveTokenToStore(
  userId: string,
  token: string,
  proxyStr: string = "",
  addedBy: string = ""
): Promise<void> {
  const repo = getTokenRepo();
  let existing = await repo.findOne({ where: { userId } });
  if (!existing) {
    existing = repo.create({
      userId,
      token: encodeToken(token),
      proxy: proxyStr,
      addedBy,
      status: "active",
      lastActiveAt: new Date(),
    });
  } else {
    existing.token = encodeToken(token);
    existing.proxy = proxyStr;
    existing.status = "active";
    existing.lastActiveAt = new Date();
    existing.lastError = "";
  }
  await repo.save(existing);
  Logger.info(`[Watchdog] Đã lưu token cho user ${userId}`);
}

/**
 * Xóa token khỏi database
 */
export async function removeTokenFromStore(userId: string): Promise<void> {
  const repo = getTokenRepo();
  await repo.delete({ userId });
  Logger.info(`[Watchdog] Đã xóa token của user ${userId}`);
}

/**
 * Gửi thông báo token chết vào channel notification
 */
async function notifyTokenDead(userId: string): Promise<void> {
  try {
    const guild = client.guilds.cache.get(questsConfig.serverId)
      ?? await client.guilds.fetch(questsConfig.serverId).catch(() => null);
    if (!guild) return;
    const channel = guild.channels.cache.get(questsConfig.completedQuestsChannel)
      ?? await guild.channels.fetch(questsConfig.completedQuestsChannel).catch(() => null);
    if (!channel?.isTextBased()) return;
    await (channel as TextChannel).send({
      content: `⚠️ **Token của user <@${userId}> đã hết hạn hoặc bị vô hiệu hóa.**\nVui lòng dùng \`/badge\` để cấp lại token mới.`,
    });
  } catch (err) {
    Logger.warn(`[Watchdog] Không gửi được thông báo token chết cho ${userId}`);
  }
}

/**
 * Khởi động quest cho một user từ token đã lưu
 * KHÔNG đăng nhập lại — chỉ fetch quest và start
 */
async function startQuestForUser(stored: StoredToken): Promise<boolean> {
  try {
    const token = decodeToken(stored.token);
    if (!isValidDiscordToken(token) || !getIdFromToken(token)) {
      stored.status = "error";
      stored.lastError = "Token không hợp lệ";
      await getTokenRepo().save(stored);
      return false;
    }

    const proxy = parseProxyString(stored.proxy);
    const user = new User(token, proxy);

    // Fetch quest
    const quests = await user.fetchQuests();
    if (!quests || quests.size === 0) {
      Logger.info(`[Watchdog] User ${stored.userId} không có quest khả dụng`);
      stored.lastActiveAt = new Date();
      await getTokenRepo().save(stored);
      user.destroy();
      return true;
    }

    // Chọn quest đầu tiên chưa hoàn thành và được hỗ trợ
    const availableQuest = quests.find(q => !q.isCompleted() && q.isSupported());
    if (!availableQuest) {
      Logger.info(`[Watchdog] User ${stored.userId} không có quest hỗ trợ`);
      user.destroy();
      return true;
    }

    user.setQuest(availableQuest);

    // Auto enroll nếu chưa
    const enrolled = availableQuest.progress.some(p => p.enrolled);
    if (!enrolled) {
      await availableQuest.enroll();
    }

    // Gán child process và start
    const child = ChildManager.getLowestUsageChild();
    if (child) {
      user.setProcess(child.process);
      child.currentTasks++;
      await user.start();
      stored.lastActiveAt = new Date();
      stored.status = "active";
      await getTokenRepo().save(stored);
      Logger.info(`[Watchdog] Đã khởi động quest ${availableQuest.id} cho user ${stored.userId}`);
      return true;
    }
    user.destroy();
    return false;
  } catch (err: any) {
    Logger.error(`[Watchdog] Lỗi khởi động user ${stored.userId}:`, err);
    return false;
  }
}

/**
 * LOGIC WATCHDOG CHÍNH — Chạy mỗi 6:00 AM GMT+7
 *
 * 1. Token đang chạy tốt trong cache → KHÔNG ĐỤNG VÀO
 * 2. Token còn sống nhưng không trong cache (bị treo) → Tự khởi động lại quest
 * 3. Token chết (API 401) → Đánh dấu lỗi + Thông báo user cấp lại
 */
export async function watchdogCheck(): Promise<void> {
  Logger.info("[Watchdog] ⏰ Bắt đầu kiểm tra token định kỳ...");
  const repo = getTokenRepo();
  const tokens = await repo.find();

  if (tokens.length === 0) {
    Logger.info("[Watchdog] Không có token nào được lưu.");
    return;
  }

  let okCount = 0;
  let deadCount = 0;
  let skipCount = 0;
  let revivedCount = 0;

  for (const stored of tokens) {
    try {
      // Bỏ qua token đã bị đánh dấu disabled
      if (stored.status === "disabled") {
        skipCount++;
        continue;
      }

      const token = decodeToken(stored.token);

      // === BƯỚC 1: Kiểm tra token còn sống không ===
      const alive = await check_token(token);

      if (!alive) {
        // === TOKEN CHẾT → Đánh dấu lỗi + Thông báo ===
        Logger.warn(`[Watchdog] Token của user ${stored.userId} đã chết.`);
        stored.status = "error";
        stored.lastError = "Token expired/invalid (health check)";
        await repo.save(stored);
        deadCount++;

        // Dừng user trong cache nếu còn
        const cachedUser = usersCache.get(stored.userId);
        if (cachedUser) {
          await cachedUser.stop(true);
        }

        // Gửi thông báo yêu cầu cấp lại token
        await notifyTokenDead(stored.userId);
        continue;
      }

      // === TOKEN CÒN SỐNG ===
      const cachedUser = usersCache.get(stored.userId);

      if (cachedUser && cachedUser.started && !cachedUser.stoped) {
        // === TOKEN ĐANG CHẠY TỐT → KHÔNG ĐỤNG VÀO ===
        Logger.info(`[Watchdog] User ${stored.userId} đang chạy tốt, bỏ qua.`);
        stored.lastActiveAt = new Date();
        await repo.save(stored);
        skipCount++;
        continue;
      }

      // === TOKEN CÒN SỐNG NHƯNG KHÔNG CHẠY (bị treo) → KHỞI ĐỘNG LẠI ===
      Logger.info(`[Watchdog] User ${stored.userId} bị treo, đang khôi phục...`);

      // Dừng user cũ nếu còn sót
      if (cachedUser) {
        await cachedUser.stop(true);
      }

      const started = await startQuestForUser(stored);
      if (started) {
        revivedCount++;
        Logger.info(`[Watchdog] ✅ Đã khôi phục quest cho user ${stored.userId}`);
      } else {
        okCount++;
      }

      // Delay nhỏ để tránh rate limit
      await new Promise(r => setTimeout(r, 2000));
    } catch (err: any) {
      Logger.error(`[Watchdog] Lỗi xử lý user ${stored.userId}:`, err);
    }
  }

  Logger.info(
    `[Watchdog] ✅ Kiểm tra hoàn tất: ${skipCount} đang chạy, ${revivedCount} khôi phục, ${okCount} OK, ${deadCount} lỗi`
  );
}

/**
 * Khôi phục token khi bot khởi động (sau 30s để DB sẵn sàng)
 */
export async function restoreOnStartup(): Promise<void> {
  Logger.info("[Watchdog] Khởi động lần đầu - kiểm tra token...");
  try {
    await watchdogCheck();
  } catch (err) {
    Logger.error("[Watchdog] Lỗi restore lần đầu:", err);
  }
}

/**
 * Khởi động watchdog scheduler
 * Chạy mỗi ngày lúc WATCHDOG_HOUR_GMT7 (mặc định 6:00 AM GMT+7)
 */
export function startWatchdogScheduler(): void {
  const hourGmt7 = parseInt(process.env.WATCHDOG_HOUR_GMT7 || "6", 10);

  // Cron với timezone GMT+7
  const cronExpr = `0 ${hourGmt7} * * *`;
  Logger.info(`[Watchdog] Lên lịch kiểm tra token: ${hourGmt7}:00 GMT+7 (cron: "${cronExpr}")`);

  cron.schedule(cronExpr, async () => {
    Logger.info("[Watchdog] ⏰ Đến giờ kiểm tra token hàng ngày...");
    try {
      await watchdogCheck();
    } catch (err) {
      Logger.error("[Watchdog] Lỗi khi kiểm tra:", err);
    }
  }, {
    timezone: "Asia/Ho_Chi_Minh",
  });

  // Ngoài ra, restore ngay khi bot khởi động (sau 30s)
  setTimeout(async () => {
    await restoreOnStartup();
  }, 30_000);
        }
