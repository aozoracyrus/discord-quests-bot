import { ClientEvents, Collection, Guild, GuildMember, Message, Snowflake, TextChannel } from "discord.js";
import { baseDiscordEvent } from "../../lib/handler/baseClientEvent.js";
import cron from "node-cron";
import { Quest } from "../../lib/quest/Quest.js";
import { User } from "../../lib/quest/User.js";
import questsConfig from "../../config/questsConfig.js";
import { getIdFromToken, isValidDiscordToken } from "../../utils/quest/tokenUtils.js";
import { questRepo, userSettingsRepo } from "../../core/cache.js";
import moment from "moment-timezone";
import { Logger } from "../../core/logger.js";

// Chỉ tạo selfUser nếu có token hợp lệ
const token = questsConfig?.notification?.token || "";
const isValidToken = isValidDiscordToken(token) && getIdFromToken(token) !== null;
export const selfUser = isValidToken ? new User(token) : null;

export default class newQuestsEvent extends baseDiscordEvent {
  public name: keyof ClientEvents = "clientReady";
  public once: boolean = true;

  private async checkQuest(quest: Quest) {
    const questDb = await quest.getDb();
    return questDb.messageSent ? null : questDb;
  }

  private async getGuildAndChannel(): Promise<{ guild: Guild; channel: TextChannel } | null> {
    const guild = this.client.guilds.cache.get(questsConfig.serverId)
      ?? await this.client.guilds.fetch(questsConfig.serverId).catch(() => null);
    if (!guild) {
      this.logger.warn("Bot không ở trong server chỉ định. Tắt thông báo quest.");
      return null;
    }
    const channel = guild.channels.cache.get(questsConfig.notification.channel)
      ?? await guild.channels.fetch(questsConfig.notification.channel).catch(() => null);
    if (!channel?.isTextBased()) {
      this.logger.warn("Kênh thông báo không hợp lệ. Tắt thông báo quest.");
      return null;
    }
    return { guild, channel: channel as TextChannel };
  }

  private async fetchMembersToDM(guild: Guild): Promise<Collection<Snowflake, GuildMember> | null> {
    const dmRoles = questsConfig?.notification?.dm?.dmRoles || [];
    if (!questsConfig.notification.dm?.enabled || dmRoles.length === 0) return null;
    const members = await guild.members.fetch().catch(() => null);
    if (!members) return null;
    const eligibleMembers = members.filter(
      member => !member.user.bot && dmRoles.some(r => member.roles.cache.has(r))
    );
    return eligibleMembers.size === 0 ? null : eligibleMembers;
  }

  private async getUserSettings(id: string) {
    const cache = this.client.userSettings.get(id);
    if (cache) return cache;
    const userData = await userSettingsRepo.findOne({ where: { userId: id } });
    if (userData) {
      this.client.userSettings.tempSet(id, userData, this.client.clientMs("30m"));
      return userData;
    }
  }

  private async sendQuestNotification(
    quest: Quest, questDoc: any, channel: TextChannel,
    members: Collection<Snowflake, GuildMember> | null
  ) {
    const messageContent = await quest.notification_message();
    const channelMessage: Message = await channel.send({ ...messageContent })
      .then(async (msg) => {
        this.logger.info(`Đã gửi thông báo quest ${quest.id} vào kênh ${channel.id}`);
        questDoc.messageSent = true;
        await questRepo.save(questDoc);
        return msg;
      })
      .catch(() => null);

    if (channelMessage) {
      channelMessage.crosspost().catch(() => null);
    }

    if (!members?.size) return;
    for (const member of members.values()) {
      const userSettings = await this.getUserSettings(member.id);
      const lang = userSettings?.lang ?? this.client.config?.defaultLanguage ?? "vi";
      const i18n = this.i18n.get(lang);
      const userMessage = await quest.notification_message(i18n);
      member.send({ ...userMessage, content: `${member.toString()}` }).catch(() => null);
    }
  }

  async executeEvent(): Promise<void> {
    if (!selfUser) {
      // Không có token selfbot → bỏ qua notification quest mới
      Logger.info("[newQuests] Không có token notification. Bỏ qua kiểm tra quest mới.");
      return;
    }

    // Kiểm tra quest mới mỗi 5 phút
    cron.schedule("0 */5 * * * *", async () => {
      this.logger.info("Đang kiểm tra quest mới...");
      const guildAndChannel = await this.getGuildAndChannel();
      if (!guildAndChannel) return;
      const { guild, channel } = guildAndChannel;

      const oldQuests = new Collection<string, Quest>();
      selfUser.quests.forEach(q => oldQuests.set(q.id, q));
      const newQuests = await selfUser.fetchQuests();

      const diff = newQuests.filter(q =>
        !oldQuests.has(q.id) &&
        moment(q.startsAt).isAfter(moment().subtract(6, "hours"))
      );
      if (!diff.size) return;

      const members = await this.fetchMembersToDM(guild);
      const unSentQuests = await Promise.all(diff.map(q => this.checkQuest(q)));
      const filteredQuests = unSentQuests.filter(q => q !== null);

      for (const questDoc of filteredQuests) {
        const quest = newQuests.get(questDoc.questId);
        if (!quest) continue;
        await this.sendQuestNotification(quest, questDoc, channel, members);
      }
      this.logger.info(`Kiểm tra quest hoàn tất lúc ${new Date().toISOString()}`);
    });
  }
}
