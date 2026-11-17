import { Entity, Column, Index } from "typeorm";
import BaseDocument from "../lib/handler/BaseDocument.js";

/**
 * Entity lưu trữ token Discord của user
 * Dùng cho watchdog tự khởi động lại token vào 6:00 AM GMT+7
 */
@Entity("stored_tokens")
class StoredToken extends BaseDocument {
  /** Discord user ID (lấy từ token) */
  @Column()
  @Index({ unique: true })
  userId: string;

  /** Token Discord (encode base64 để tránh log lộ) */
  @Column()
  token: string;

  /** Proxy string (ip:port:user:pass) hoặc rỗng */
  @Column({ nullable: true, default: "" })
  proxy: string;

  /** ID của user Discord đã thêm token này (để audit) */
  @Column({ nullable: true })
  addedBy: string;

  /** Lần cuối token hoạt động thành công */
  @Column({ type: "timestamp", nullable: true })
  lastActiveAt: Date;

  /** Trạng thái: active / error / disabled */
  @Column({ default: "active" })
  status: string;

  /** Ghi chú lỗi gần nhất (nếu có) */
  @Column({ nullable: true })
  lastError: string;
}

export default StoredToken;

// === Helper encode/decode token ===
export const encodeToken = (token: string): string =>
  Buffer.from(token, "utf-8").toString("base64");

export const decodeToken = (encoded: string): string =>
  Buffer.from(encoded, "base64").toString("utf-8");
