import app from "./app";
import { assertEnv, env } from "./config/env";
import { connectDb } from "./db/connect";

// Validate env, then start.
async function startServer() {
  console.log("[server] starting...");
  try {
    assertEnv();
    console.log("[server] env OK");
    await connectDb();
    app.listen(env.API_PORT, () => {
      console.log(`[server] listening on http://localhost:${env.API_PORT}`);
    });
  } catch (error) {
    console.error("[server] startup failed:", error);
    process.exit(1);
  }
}

startServer();
