import type { PublicUser } from "@chargewise/shared";

declare global {
  namespace Express {
    interface Request {
      authenticatedUser?: PublicUser;
    }
  }
}

export {};
