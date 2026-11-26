import { createApp } from "./server.mjs";
import { isLoopback } from "./auth.mjs";

const host = process.env.HOST || "127.0.0.1";
const port = Number(process.env.PORT || 3001);
if (!isLoopback(host) && !process.env.OWNER_PASSWORD?.trim()) {
  throw new Error(
    "Refusing external binding without OWNER_PASSWORD. Set a password or use HOST=127.0.0.1.",
  );
}
if (!Number.isInteger(port) || port < 0 || port > 65535)
  throw new Error("PORT must be an integer from 0 to 65535.");
const app = createApp();
app.server.listen(port, host, () =>
  console.log(
    `DanceForm API listening on http://${host}:${app.server.address().port}`,
  ),
);
for (const signal of ["SIGINT", "SIGTERM"])
  process.once(signal, async () => {
    await app.close();
    process.exit(0);
  });
