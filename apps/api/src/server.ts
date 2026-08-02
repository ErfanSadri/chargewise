import { createApp } from "./app.js";
import { loadLocalEnvironment, parseEnvironment } from "./config/environment.js";

loadLocalEnvironment();

const environment = parseEnvironment();
const app = createApp();

app.listen(environment.API_PORT, () => {
  console.log(`ChargeWise API running at http://localhost:${environment.API_PORT}`);
});
