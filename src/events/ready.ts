import { ActivityType, ApplicationCommandType, ClientEvents } from "discord.js";
import { baseDiscordEvent } from "../lib/handler/baseClientEvent.js";
import GuildDocument from "../entities/guildSettings.js";
import { delay } from "../utils/tools.js";
import Cooldown from "../entities/cooldown.js";
import { cooldown } from "../core/cooldown.js";
import { AppDataSource } from "../index.js";
import { imageRepo } from "../core/cache.js";
import { Logger } from "../core/logger.js";
import { ChildManager } from "../core/ChildManager.js";
import { startWatchdogScheduler } from "../core/watchdog.js"; // ← THÊM

export default class readyEvent extends baseDiscordEvent {
  public name: keyof ClientEvents = "clientReady";
  public once: boolean = true;

  async executeEvent(): Promise<void> {
    // Chờ database khởi tạo xong
    while (!AppDataSource.isInitialized) {
      await delay(500);
    }

    // === Đăng ký slash commands ===
    const slashCommands = this.client.slashCommands.filter(
      e => e.name && e.description && (!e.isSubCommand || e.isSubCommand && e.isConfigFile) && e.enabled
    );
    const commands: any[] = slashCommands.map(e => ({
      name: e.name,
      description: e.description,
      options: e?.options || [],
      contexts: e.getContexts(),
      nsfw: e.isNSFW(),
      permissions: e.getPermissions(),
      type: ApplicationCommandType.ChatInput,
    }));
    this.client.application.commands.set(commands as any[])
      .catch(err => this.logger.error("Không thể set slash commands:", err))
      .then(() => this.logger.info(`Đã set ${commands.length} slash commands.`));

    this.logger.info(`Bot đã sẵn sàng! Đăng nhập với ID ${this.client.user.id}`);

    // === Load guild settings ===
    const guilds = await AppDataSource.getRepo(GuildDocument).find();
    guilds.forEach(guild => {
      this.client.guildSettings.set(guild.guildId, guild);
      this.logger.info(`Đã tải settings cho guild: ${guild.guildId}`);
    });

    // === Set status ===
    this.client.user.setStatus("idle");
    this.client.updateActivity();
    setInterval(() => this.client.updateActivity(), 30_000);

    // === Load images ===
    const images = await imageRepo.find();
    images.forEach(img => this.client.images.set(img.key, img));
    Logger.info(`Đã tải ${this.client.images.size} ảnh`);

    this.client.ready = true;

    // === Cleanup expired cooldowns ===
    const cooldownsRepo = AppDataSource.getRepo(Cooldown);
    setInterval(async () => {
      const expired = await cooldownsRepo.find({
        where: { expireDate: this.appDataSource.smartLessThan(new Date()) },
      });
      expired.forEach(async cd => {
        const instance = await cooldown.get(cd.cdKey);
        if (instance) instance.kill();
        // @ts-ignore
        else await cooldownsRepo.delete(cd.id);
      });
    }, this.client.clientMs("30s"));

    // === KHỞI ĐỘNG WATCHDOG ===
    startWatchdogScheduler();
    Logger.info("✅ Watchdog đã được khởi động");
  }
}
