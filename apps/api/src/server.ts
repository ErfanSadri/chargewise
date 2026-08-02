import { createApp } from "./app.js";

const port = Number(process.env.API_PORT ?? 3000);

if (!Number.isInteger(port) || port <= 0) {
  throw new Error("API_PORT must be a positive number.");
}

const app = createApp();

app.listen(port, () => {
  console.log(`ChargeWise API running at http://localhost:${port}`);
});