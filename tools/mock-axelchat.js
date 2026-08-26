// Мок AxelChat: поднимает WebSocket-сервер на 8356 и шлёт тестовые сообщения
// в формате NEW_MESSAGES_RECEIVED. Нужен для проверки без запущенного AxelChat.
//
// Запуск: node tools/mock-axelchat.js

import { WebSocketServer } from "ws";

const PORT = 8356;
const COMMAND = process.argv[2] || "!хил"; // можно передать команду первым аргументом

const authors = [
  { id: "u1", name: "Рина", serviceId: "youtube" },
  { id: "u2", name: "MaxPower", serviceId: "kick" },
  { id: "u3", name: "gg_wp", serviceId: "prime" },
  { id: "u4", name: "НочнойЗритель", serviceId: "youtube" },
  { id: "u5", name: "Котик", serviceId: "kick" },
  { id: "u6", name: "randomguy", serviceId: "prime" },
];

const chatter = ["привет", "хаха", "gg", COMMAND, COMMAND, "круто", `${COMMAND} плиз`];

const wss = new WebSocketServer({ port: PORT });
console.log(`[mock-axelchat] WS-сервер на ws://127.0.0.1:${PORT}, команда: ${COMMAND}`);

wss.on("connection", (ws) => {
  console.log("[mock-axelchat] клиент подключился");

  // Handshake как у настоящего AxelChat.
  ws.send(JSON.stringify({
    type: "HELLO",
    data: { app: { name: "MockAxelChat", version: "0.0.0" } },
  }));

  const timer = setInterval(() => {
    const author = authors[Math.floor(Math.random() * authors.length)];
    const text = chatter[Math.floor(Math.random() * chatter.length)];
    ws.send(JSON.stringify({
      type: "NEW_MESSAGES_RECEIVED",
      data: {
        messages: [{
          id: `m${Date.now()}${Math.random().toString(36).slice(2, 6)}`,
          author,
          contents: [{ type: "text", data: { text } }],
          publishedAt: new Date().toISOString(),
          receivedAt: new Date().toISOString(),
          deleted: false,
        }],
      },
    }));
  }, 900);

  ws.on("close", () => clearInterval(timer));
});
