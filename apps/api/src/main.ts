import { createApp } from "./app.js";
const port = Number(process.env.PORT ?? process.env.API_PORT ?? 4311);
const host =
  process.env.API_HOST ?? (process.env.PORT ? "0.0.0.0" : "127.0.0.1");
const app = await createApp({
  documents: { worker: process.env.VERCEL !== "1" },
});
await app.listen(port, host);
