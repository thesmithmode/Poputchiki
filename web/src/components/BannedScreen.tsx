import type { FC } from "react";
import { useState } from "react";
import { apiFetch } from "../lib/api";

interface Props {
  reason: string | null;
  bannedAt: string | null;
}

export const BannedScreen: FC<Props> = ({ reason, bannedAt }) => {
  const [sent, setSent] = useState(false);

  const handleContact = async () => {
    try {
      await apiFetch("/support/messages", {
        method: "POST",
        body: JSON.stringify({ message: "Прошу пересмотреть блокировку аккаунта" }),
      });
    } catch {
      // disable button on error too
    }
    setSent(true);
  };

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        minHeight: "100vh",
        padding: "24px",
        textAlign: "center",
      }}
    >
      <h1>Аккаунт заблокирован</h1>
      {reason && <p>{reason}</p>}
      {bannedAt && <p>Дата блокировки: {new Date(bannedAt).toLocaleDateString("ru-RU")}</p>}
      <button type="button" onClick={handleContact} disabled={sent}>
        {sent ? "Обращение отправлено" : "Связаться с поддержкой"}
      </button>
    </div>
  );
};
