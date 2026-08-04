import * as argon2 from "argon2";

export interface PasswordHasher {
  hash: (password: string) => Promise<string>;
  verify: (passwordHash: string, password: string) => Promise<boolean>;
}

export const argon2PasswordHasher: PasswordHasher = {
  async hash(password) {
    return argon2.hash(password, {
      type: argon2.argon2id,
    });
  },

  async verify(passwordHash, password) {
    return argon2.verify(passwordHash, password);
  },
};
