import I18nManager from "../core/i18n.js";
import config from "../config/config.js";

// Ngôn ngữ mặc định: Tiếng Việt
export const i18n = new I18nManager(config.defaultLanguage || "vi");
