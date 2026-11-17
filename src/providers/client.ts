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

(async () => {
  try {
    Logger.info("[Client] 🔄 Đang load commands...");
    await loadCommands(client);
    Logger.info("[Client] ✅ Commands đã load xong.");

    Logger.info("[Client] 🔄 Đang đăng nhập Discord...");
    Logger.info(`[Client] Token length: ${config.token?.length || 0} ký tự`);
    
    if (!config.token || config.token.length < 50) {
      throw new Error("Token quá ngắn hoặc rỗng!");
    }

    const tokenParts = config.token.split('.');
    if (tokenParts.length !== 3) {
      throw new Error(`Token format sai! Có ${tokenParts.length} phần, cần 3 phần`);
    }
    Logger.info(`[Client] Token format OK: ${tokenParts.length} phần`);

    await client.login(config.token);
    Logger.info("[Client] ✅ Đăng nhập Discord THÀNH CÔNG!");
  } catch (error: any) {
    Logger.error("[Client] ❌ LỖI KHI LOGIN:", error?.message || error);
    Logger.error("[Client] Stack:", error?.stack || "No stack");
  }
})();

client.once("ready", () => {
  Logger.info(`[Client] 🎉 Bot đã ONLINE: ${client.user?.tag}`);
  Logger.info(`[Client] 🆔 Bot ID: ${client.user?.id}`);
  Logger.info(`[Client] 📊 Đang ở ${client.guilds.cache.size} server(s)`);
});

client.on("error", (error) => {
  Logger.error("[Client] Discord client error:", error);
});

export default client;
