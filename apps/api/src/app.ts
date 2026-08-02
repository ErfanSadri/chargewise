import express from "express";

export function createApp() {
  const app = express();

  app.use(express.json());

  app.get("/api/v1/health", (_request, response) => {
    response.status(200).json({
      data: {
        status: "ok",
      },
    });
  });

  return app;
}
