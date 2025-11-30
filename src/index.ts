import { Hono } from "hono";
import { bearerAuth } from "hono/bearer-auth";
import openaiRouter from "./router/OpenAIRouter";
import claudeRouter from "./router/ClaudeRouter";
import {logger} from "hono/logger";

const app = new Hono<{ Bindings: Bindings }>();

// Request logging middleware
app.use('*', logger())

// Standard Auth Middleware
app.use("/*", async (c, next) => {
  // Skip if it is a jetbrains request
  if (c.req.path.startsWith("/jb/")) {
    return next();
  }
  const auth = bearerAuth({ token: c.env.PROXY_API_KEY });
  return auth(c, next);
});

// JetBrains Auth Middleware
app.use("/jb/:token/*", async (c, next) => {
  const token = c.req.param("token");
  if (token !== c.env.PROXY_API_KEY) {
    return c.text("Unauthorized", 401);
  }
  return next();
});

// Mount routers for standard auth
app.route("/", openaiRouter);
app.route("/", claudeRouter);

// Mount routers for JetBrains auth
app.route("/jb/:token", openaiRouter);

app.get("/message", (c) => {
  return c.text("Hello Hono!");
});

export default app;
