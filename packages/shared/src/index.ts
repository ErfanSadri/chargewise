export type HealthStatus = "ok";

export interface HealthResponse {
  data: {
    status: HealthStatus;
  };
}
