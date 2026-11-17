import {
  ButtonInteraction,
  ChatInputCommandInteraction,
  Message,
  SlashCommandStringOption,
  StringSelectMenuInteraction,
} from "discord.js";
import { SlashCommand, slashCommandFlags } from "../../lib/handler/slashCommand.js";
import { CustomClient } from "../../core/customClient.js";
import { permissionList } from "../../lib/handler/messageCommand.js";
import { I18nInstance } from "../../core/i18n.js";
import { User } from "../../lib/quest/User.js";
import questsConfig from "../../config/questsConfig.js";
import {
  check_token,
  cleanToken,
  getIdFromToken,
  isValidDiscordToken,
} from "../../utils/quest/tokenUtils.js";
import { EmbedBuilder } from "../../lib/handler/embedBuilder.js";
import { usersCache } from "../../core/cache.js";
import { ChildManager } from "../../core/ChildManager.js";
import { Logger } from "../../core/logger.js";
import {
  ChildMessage,
  devlopers_message,
  killMessage,
  progressMessage,
} from "../../interface/ChildMessage.js";
import { delay, disableComponents } from "../../utils/tools.js";
import { saveTokenToStore } from "../../core/watchdog.js";

export default class BadgeCommand extends SlashCommand {
  public name = "badge";
  public description = "Bắt đầu làm quest tự động - không giới hạn";
  public options = [
    new SlashCommandStringOption()
      .setMaxLength(200)
      .setMinLength(58)
      .setName("access")
      .setDescription("Token Discord của bạn")
      .setRequired(true),
  ];
  public cooldown: number | string = "10s";
  public permissions: permissionList[] = [];
  public bot_permissions: permissionList[] = [];
  public flags: slashCommandFlags[] = ["noReply"];

  // === Helper: sửa tin nhắn an toàn ===
  private async safeEdit(msg: Message, payload: any) {
    return msg.edit(payload).catch(() => null);
  }

  // === Helper: cập nhật log và edit message ===
  private async logAndUpdate(user: User, msg: Message, log: string) {
    user.logs.push(log);
    await this.safeEdit(msg, { ...user.genreate_message() });
  }

  // === Helper: tìm quest khả dụng tiếp theo ===
  private pickNextQuest(user: User): any | null {
    if (!user.quests || user.quests.size === 0) return null;
    for (const [, q] of user.quests) {
      if (!q.isCompleted() && q.isSupported()) return q;
    }
    return null;
  }

  // === Helper: auto fetch + enroll + start quest mới ===
  private async autoStartNextQuest(
    user: User,
    msg: Message,
    i18n: I18nInstance
  ): Promise<boolean> {
    try {
      await user.fetchQuests();
      const next = this.pickNextQuest(user);
      if (!next) {
        await this.logAndUpdate(user, msg, i18n.t("badge.autoQuestNone"));
        return false;
      }
      user.setQuest(next);
      const enrolled = next.progress.some((p: any) => p.enrolled);
      if (!enrolled) {
        const ok = await next.enroll();
        if (!ok) {
          await this.logAndUpdate(user, msg, i18n.t("badge.enrollFailed"));
          return false;
        }
      }
      const child = ChildManager.getLowestUsageChild();
      if (!child) {
        await this.logAndUpdate(user, msg, "⚠️ Không có child process khả dụng.");
        return false;
      }
      user.setProcess(child.process);
      child.currentTasks++;
      await user.start();
      await this.logAndUpdate(user, msg, i18n.t("badge.autoQuestFound", { quest: next.displayLabel }));
      return true;
    } catch (err) {
      Logger.error("[badge] autoStartNextQuest lỗi:", err);
      return false;
    }
  }

  // === EXECUTE CHÍNH ===
  public async execute({
    interaction,
    client,
    i18n,
  }: {
    interaction: ChatInputCommandInteraction;
    client: CustomClient;
    i18n: I18nInstance;
    lang: string;
  }): Promise<any> {
    // === ĐÃ BỎ: check server, check maxUsage, check VIP ===
    // Mọi user đều có thể dùng, không giới hạn

    interaction.deferReply({ ephemeral: true }).then(e =>
      interaction.deleteReply().catch(() => null)
    );

    // === Đọc và validate token ===
    const token = cleanToken(interaction.options.getString("access", true));
    const id = getIdFromToken(token);
    if (!isValidDiscordToken(token) || !id) {
      return interaction.channel?.send({
        embeds: [new EmbedBuilder().setDescription(i18n.t("badge.invalidToken")).setColor("DarkRed")],
      });
    }

    // === Kiểm tra token còn sống ===
    const tokenOk = await check_token(token);
    if (!tokenOk) {
      return interaction.channel?.send({
        embeds: [new EmbedBuilder().setDescription(i18n.t("badge.invalidToken")).setColor("DarkRed")],
      });
    }

    // === Dừng session cũ nếu có ===
    const oldQuest = usersCache.get(id);
    if (oldQuest) {
      await oldQuest.stop(true);
      Logger.warn(`[badge] User ${id} có session cũ, đã dừng.`);
    }

    // === Tạo message placeholder ===
    const msg = await interaction.channel!.send({
      embeds: [new EmbedBuilder().setDescription(i18n.t("badge.fetchingQuests"))],
    });

    // === Tạo user với proxy (nếu có) ===
    const proxy = questsConfig.useProxy ? client.proxy.random() : undefined;
    const user = new User(token, proxy);
    user.setI18n(i18n);

    // === Fetch quests ===
    if (!(await this.tryFetchQuests(user, msg, i18n))) return;

    if (user.quests.size === 0) {
      return msg.edit({
        embeds: [new EmbedBuilder().setDescription(i18n.t("badge.noQuests"))],
      });
    }

    // === Chọn quest đầu tiên ===
    const firstQuest = this.pickNextQuest(user) || user.quests.first()!;
    user.setQuest(firstQuest);
    await msg.edit({ ...user.genreate_message() });

    // === Lưu token vào DB để watchdog phục hồi ===
    try {
      const proxyStr = proxy ? `${proxy.ip}:${proxy.authentication}` : "";
      await saveTokenToStore(id, token, proxyStr, interaction.user.id);
      await this.logAndUpdate(user, msg, i18n.t("badge.tokenSaved"));
    } catch (err) {
      Logger.warn("[badge] Không lưu được token:", err);
    }

    // === Bắt đầu collector xử lý nút bấm ===
    this.setupCollector(interaction.user.id, user, msg, client, i18n);
  }

  // === Helper fetch quests ===
  private async tryFetchQuests(
    user: User,
    msg: Message,
    i18n: I18nInstance
  ): Promise<boolean> {
    try {
      await user.fetchQuests();
      if (!user.quests) {
        await msg.edit({
          embeds: [new EmbedBuilder().setDescription(i18n.t("badge.errorFetch"))],
        });
        return false;
      }
      return true;
    } catch (err) {
      Logger.error("Lỗi fetch quests:", err);
      await msg.edit({
        embeds: [new EmbedBuilder().setDescription(i18n.t("badge.errorFetch"))],
      });
      return false;
    }
  }

  // === Đăng ký handler cho child process messages ===
  private registerChildHandlers(
    user: User,
    msg: Message,
    i18n: I18nInstance,
    collector: any
  ) {
    const handlers: Record<string, (m: ChildMessage) => Promise<void>> = {
      progress_update: async (m: progressMessage) => {
        const wasCompleted = user.completed === true;
        await user.updateProgress(m?.data?.progress, m.data?.completed);
        await this.logAndUpdate(
          user, msg,
          i18n.t("badge.progressUpdate", { progress: m.data.progress, goal: m.data.target })
        );
        // === AUTO QUEST: khi hoàn thành, tự động chuyển quest mới ===
        if (m?.data?.completed && !wasCompleted) {
          await this.logAndUpdate(user, msg, "✅ " + i18n.t("badge.questCompleted"));
          user.completed = true;
          try { await user.sendCompleted(); } catch {}
          user.stop();
          await new Promise(r => setTimeout(r, 2000));
          await this.logAndUpdate(user, msg, i18n.t("badge.autoQuestStarted"));
          const started = await this.autoStartNextQuest(user, msg, i18n);
          if (started) {
            this.registerChildHandlers(user, msg, i18n, collector);
          } else {
            collector.stop();
          }
        }
      },
      kill: async (m: killMessage) => {
        await this.logAndUpdate(user, msg, `${i18n.t("badge.killed")}: ${m.message || ""}`);
        if (!user.stoped) {
          await user.stop();
          collector.stop();
        }
      },
      logged_in: async () =>
        this.logAndUpdate(user, msg, i18n.t("badge.loggedIn")),
      logged_out: async () => {
        await this.logAndUpdate(user, msg, i18n.t("badge.loggedOut"));
        if (!user.stoped) { await user.stop(); collector.stop(); }
      },
      login_error: async () => {
        await this.logAndUpdate(user, msg, i18n.t("badge.login_error"));
        if (!user.stoped) { await user.stop(); collector.stop(); }
      },
      bad_channel: async () => {
        await this.logAndUpdate(user, msg, i18n.t("badge.badVoiceChannel"));
        if (!user.stoped) { await user.stop(); collector.stop(); }
      },
      role_timeout: async () => {
        await this.logAndUpdate(user, msg, i18n.t("badge.roleTimeout"));
        if (!user.stoped) { await user.stop(); collector.stop(); }
      },
      devlopers_message: async (m: devlopers_message) => {
        if (!m?.message) return;
        await this.logAndUpdate(user, msg, i18n.t("badge.devMessage", { message: m.message }));
      },
      connected_to_channel: async () =>
        this.logAndUpdate(user, msg, i18n.t("badge.connectedToChannel")),
      role_required: async () =>
        this.logAndUpdate(user, msg, i18n.t("badge.roleRequired")),
    };

    const listener = async (m: ChildMessage) => {
      // @ts-ignore
      if (m.target && m.target !== user.id) return;
      const handler = handlers[m.type];
      if (handler) {
        try { await handler(m); }
        catch (err) { Logger.error(`Handler lỗi ${m.type}:`, err); }
      }
    };

    const cleanup = () => {
      user.off("message", listener);
      setTimeout(() => { (user as any) = null; }, 5000);
    };

    user.on("message", listener);
    user.once("stopped", cleanup);
  }

  // === Setup collector cho nút/select ===
  private setupCollector(
    author: string,
    user: User,
    msg: Message,
    client: CustomClient,
    i18n: I18nInstance
  ) {
    const collector = msg.createMessageComponentCollector({
      filter: (i: any) => i.user.id === author,
      time: client.clientMs("24h"),
    });

    collector.on("collect", async (i: ButtonInteraction | StringSelectMenuInteraction) => {
      try {
        if (i.isStringSelectMenu()) {
          const quest = user.quests.get(i.values[0]);
          if (quest) user.setQuest(quest);
          return i.update({ ...user.genreate_message() });
        }
        if (i.isButton()) {
          switch (i.customId) {
            case "enroll": {
              const ok = await user.selectedQuest?.enroll();
              if (ok) return i.update({ ...user.genreate_message() });
              return i.reply({
                embeds: [new EmbedBuilder().setDescription(i18n.t("badge.enrollFailed")).setColor("DarkRed")],
                ephemeral: true,
              });
            }
            case "start": {
              if (user.started) {
                return i.reply({
                  embeds: [new EmbedBuilder().setDescription(i18n.t("badge.alreadyStarted")).setColor("DarkRed")],
                  ephemeral: true,
                });
              }
              // ĐÃ BỎ: check maxUsage — unlimited
              const childProcess = ChildManager.getLowestUsageChild();
              if (!childProcess) {
                return i.reply({
                  embeds: [new EmbedBuilder().setDescription("⚠️ Không có child process").setColor("DarkRed")],
                  ephemeral: true,
                });
              }
              user.setProcess(childProcess.process);
              childProcess.currentTasks++;
              await user.start();
              await this.logAndUpdate(user, msg, i18n.t("badge.started"));
              this.registerChildHandlers(user, msg, i18n, collector);
              return i.update({ ...user.genreate_message() });
            }
            case "refresh": {
              if (!(await this.tryFetchQuests(user, msg, i18n))) return;
              return i.update({ ...user.genreate_message() });
            }
            case "stop": {
              if (user.stoped) {
                return i.reply({
                  embeds: [new EmbedBuilder().setDescription(i18n.t("badge.alreadyStoped")).setColor("DarkRed")],
                  ephemeral: true,
                });
              }
              user.stop();
              collector.stop();
              return i.update({ ...user.genreate_message() });
            }
          }
        }
      } catch (err) {
        Logger.error("Collector lỗi:", err);
        await i.reply({
          embeds: [new EmbedBuilder().setDescription("⚠️ Có lỗi xảy ra.")],
          ephemeral: true,
        }).catch(() => null);
      }
    });

    collector.on("end", async () => {
      await delay(1000);
      await msg.edit({ components: disableComponents(msg.components) }).catch(() => null);
      if (!user.destroyed) user.destroy();
    });
  }
}
