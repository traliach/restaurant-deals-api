import app from "./app";
import { assertEnv, env } from "./config/env";
import { connectDb } from "./db/connect";

async function startServer() {
  try {
    assertEnv();
    await connectDb();

    app.listen(env.API_PORT, () => {
      console.log(`API running on http://localhost:${env.API_PORT}`);
      console.log("DB connected");
    });
  } catch (error) {
    console.error("Startup failed", error);
    process.exit(1);
  }
}

startServer();
