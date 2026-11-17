import { Options, Partials } from "discord.js";
import { CustomClient } from "../core/customClient.js";
import { loadCommands } from "../handler/loadCommands.js";
import config from "../config/config.js";
import { Logger } from "../core/logger.js";

const client = new CustomClient({
  intents: 33539,
  partials: [Partials.Message, Partials.GuildMember, Partials.Channel, Partials.Reaction, Partials.User, Partials.ThreadMember],
  failIfNotExists: false,
  makeCache: Options.cacheWithLimits({
    ...Options.DefaultMakeCacheSettings,
    ReactionManager: 0,
    ApplicationCommandManager: 0,
    ApplicationEmojiManager: 500,
    AutoModerationRuleManager: 0,
    BaseGuildEmojiManager: 0,
    DMMessageManager: 25,
    EntitlementManager: 0,
    GuildBanManager: 0,
    GuildEmojiManager: 0,
    GuildInviteManager: 0,
    GuildMemberManager: 100,
    GuildScheduledEventManager: 0,
    GuildStickerManager: 0,
    MessageManager: 100,
    PresenceManager: 500000,
    ReactionUserManager: 0,
    GuildForumThreadManager: 0,
    GuildMessageManager: 10,
    GuildTextThreadManager: 0,
    StageInstanceManager: 0,
    ThreadManager: 0,
    ThreadMemberManager: 0,
    UserManager: 0,
    VoiceStateManager: 0,
  }),
});

// === Login với error handling chi tiết ===
(async () => {
  try {
    Logger.info("[Client] 🔄 Đang load commands...");
    const startLoad = Date.now();
    await loadCommands(client);
    Logger.info(`[Client] ✅ Commands đã load xong (${Date.now() - startLoad}ms)`);

    Logger.info("[Client] 🔄 Đang đăng nhập Discord...");
    Logger.info(`[Client] Token length: ${config.token?.length || 0} ký tự`);
    Logger.info(`[Client] Token starts with: ${config.token?.substring(0, 20)}...`);
    
    if (!config.token || config.token.length < 50) {
      throw new Error("Token quá ngắn hoặc rỗng! Kiểm tra src/config/config.ts");
    }

    // Kiểm tra format token (phải có 3 phần cách nhau bởi .)
    const tokenParts = config.token.split('.');
    if (tokenParts.length !== 3) {
      throw new Error(`Token format sai! Có ${tokenParts.length} phần, cần 3 phần cách nhau bởi '.'`);
    }
    Logger.info(`[Client] Token format OK: ${tokenParts.length} phần`);

    // Timeout 30s cho login
    const loginPromise = client.login(config.token);
    const timeoutPromise = new Promise<never>((_, reject) => 
      setTimeout(() => reject(new Error("Login timeout sau 30 giây - Discord có thể đang block IP")), 30000)
    );

    await Promise.race([loginPromise, timeoutPromise]);
    Logger.info("[Client] ✅ Đăng nhập Discord THÀNH CÔNG!");
  } catch (error: any) {
    Logger.error("[Client] ❌ LỖI KHI LOGIN:", error?.message || error);
    Logger.error("[Client] Stack:", error?.stack || "No stack");
    
    // Kiểm tra lỗi cụ thể
    if (error?.message?.includes("invalid token")) {
      Logger.error("[Client] 💡 Token không hợp lệ. Vào Discord Developer Portal → Bot → Reset Token");
    } else if (error?.message?.includes("timeout")) {
      Logger.error("[Client] 💡 Discord có thể đang block IP của Render. Thử reset service hoặc đổi region");
    } else if (error?.message?.includes("disallowed intents")) {
      Logger.error("[Client] 💡 Bật Privileged Intents trong Discord Developer Portal:");
      Logger.error("[Client]    - Message Content Intent");
      Logger.error("[Client]    - Server Members Intent");
    }
    
    // KHÔNG exit - giữ Express server chạy để debug
  }
})();

// Log khi bot thực sự online
client.once("ready", () => {
  Logger.info(`[Client] 🎉 Bot đã ONLINE với tên: ${client.user?.tag}`);
  Logger.info(`[Client] 🆔 Bot ID: ${client.user?.id}`);
  Logger.info(`[Client] 📊 Đang ở ${client.guilds.cache.size} server(s)`);
});

client.on("error", (error) => {
  Logger.error("[Client] Discord client error:", error);
});

client.on("warn", (warning) => {
  Logger.warn("[Client] Discord warning:", warning);
});

export default client;
