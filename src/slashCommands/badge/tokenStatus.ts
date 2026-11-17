import { ChatInputCommandInteraction } from "discord.js";
import { SlashCommand, slashCommandFlags } from "../../lib/handler/slashCommand.js";
import { CustomClient } from "../../core/customClient.js";
import { permissionList } from "../../lib/handler/messageCommand.js";
import { I18nInstance } from "../../core/i18n.js";
import { EmbedBuilder } from "../../lib/handler/embedBuilder.js";
import { AppDataSource } from "../../index.js";
import StoredToken from "../../entities/tokenStore.js";
import { usersCache } from "../../core/cache.js";
import { formatDiscordTimestamp } from "../../utils/tools.js";

export default class tokenStatus extends SlashCommand {
  public name: string = "token-status";
  public description: string = "Kiểm tra trạng thái token đã lưu";
  public options = [];
  public cooldown: number | string = "30s";
  public permissions: permissionList[] = [];
  public bot_permissions: permissionList[] = [];
  public flags: slashCommandFlags[] = ["ephemeral"];

  public async execute({
    interaction,
    i18n,
  }: {
    interaction: ChatInputCommandInteraction;
    client: CustomClient;
    i18n: I18nInstance;
    lang: string;
  }): Promise<any> {
    const repo = AppDataSource.getRepo(StoredToken);
    const tokens = await repo.find();

    if (tokens.length === 0) {
      return interaction.editReply({
        embeds: [new EmbedBuilder().setDescription(i18n.t("tokenStatus.notFound")).setColor("DarkRed")],
      });
    }

    let text = `# ${i18n.t("tokenStatus.title")}\n`;

    for (const t of tokens) {
      const isRunning = usersCache.has(t.userId);
      const statusEmoji = t.status === "active"
        ? (isRunning ? "🟢" : "🟡")
        : "🔴";
      const statusText = t.status === "active"
        ? (isRunning ? i18n.t("tokenStatus.active") : "🟡 Đã lưu nhưng chưa chạy")
        : i18n.t("tokenStatus.error");

      text += `\n**${statusEmoji} ${i18n.t("tokenStatus.userId")}:** \`${t.userId}\``;
      text += `\n- **${i18n.t("tokenStatus.status")}:** ${statusText}`;
      if (t.lastActiveAt) {
        text += `\n- **${i18n.t("tokenStatus.lastActive")}:** ${formatDiscordTimestamp(new Date(t.lastActiveAt).getTime(), "R")}`;
      }
      if (t.status === "error" && t.lastError) {
        text += `\n- **Lỗi:** \`${t.lastError}\``;
      }
      text += `\n- **${i18n.t("tokenStatus.questRunning")}:** ${isRunning ? "✅" : "❌"}\n`;
    }

    return interaction.editReply({
      embeds: [new EmbedBuilder().setDescription(text).setColor("Random")],
    });
  }
}
