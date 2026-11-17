import { CustomClient } from "../core/customClient.js";

// Hàm đọc env an toàn
const env = (k: string, d: string = "") => process.env[k]?.trim() || d;
const envBool = (k: string, d: boolean) => {
  const v = process.env[k];
  if (v === undefined) return d;
  return v.toLowerCase() === "true";
};
const envInt = (k: string, d: number) => {
  const v = parseInt(process.env[k] || "", 10);
  return Number.isFinite(v) ? v : d;
};

export default {
  // === Token selfbot notification (tùy chọn) ===
  notification: {
    token: env("SELFBOT_TOKEN", ""),
    channel: env("NOTIFICATION_CHANNEL_ID", "1414963290391707779"),
    role: env("VOICE_ROLE_ID", ""),
    dm: {
      enabled: envBool("ENABLE_NOTIFICATION_DM", false),
      dmRoles: [] as string[],
    },
  },

  // === ĐÃ BỎ bypassLimit — mọi user đều unlimited ===
  bypassLimit: [] as string[],

  // === Danh sách quest có thời gian (duration) ===
  durationQuests: [
    "WATCH_VIDEO",
    "PLAY_ON_DESKTOP",
    "STREAM_ON_DESKTOP",
    "PLAY_ACTIVITY",
    "WATCH_VIDEO_ON_MOBILE",
    "PLAY_ON_XBOX",
    "PLAY_ON_PLAYSTATION",
  ],

  // === Kênh upload ảnh reward ===
  image: {
    channelId: env("IMAGE_CHANNEL_ID", "1421221274721456242"),
    guildId: env("MAIN_SERVER_ID", "1399471603003428966"),
  },

  // === Server chính (chỉ để log/notification) ===
  serverId: env("MAIN_SERVER_ID", "1399471603003428966"),
  completedQuestsChannel: env("COMPLETED_QUESTS_CHANNEL_ID", "1414963290391707779"),

  // === Voice (cho quest yêu cầu voice) ===
  voice: {
    channel: env("VOICE_CHANNEL_ID", "1421938834651742270"),
    role: env("VOICE_ROLE_ID", "1405572212403994684"),
  },

  logStrings: [] as string[],

  // === Child process — unlimited = 999 ===
  childProcessCount: envInt("CHILD_PROCESS_COUNT", 1),
  questsPerChildProcess: envInt("QUESTS_PER_CHILD_PROCESS", 999),

  // === Proxy (tắt mặc định) ===
  useProxy: envBool("USE_PROXY", false),
  proxyType: "http",

  // === Nút hỗ trợ ===
  buttons: [
    {
      url: "https://youtu.be/eJoa4obHhng",
      emoji: (e: CustomClient) => e.getEmoji("youtube", false) ?? "▶️",
    },
  ],

  customRewardsImage: {
    "1298745361602449479": "https://i.ibb.co/rRNztwKq/reward.webp",
    "1287881739531976815": "https://i.ibb.co/vxTHNqsS/eff35518172b971fa47c521ca21c7576d3a245433a669a6765f63b744b7b733a.png",
  },
  customRewardsEmoji: {
    "1287881739531976815": "orbIcon",
    "1298745361602449479": "nitro_level_stone",
  },

  inviteUrl: "https://discord.gg/kZHHmhKE",

  // === Tin nhắn giới thiệu bot ===
  joinMessage: `## 🤖 Bot Quest Discord
- **Gõ /badge + token để bắt đầu làm quest tự động.**
- **Bot sẽ tự động nhận quest mới khi hoàn thành quest cũ.**
- **Token được lưu an toàn và tự khởi động lại mỗi sáng.**
- **Bot miễn phí 100%, không giới hạn.**`,
};
