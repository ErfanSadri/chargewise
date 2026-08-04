import { beforeAll, describe, expect, it } from "vitest";

import { argon2PasswordHasher } from "./password-hasher.js";

const exactPassword = "  Pässword-for-ChargeWise 🔋  ";

describe("Argon2 password hasher", () => {
  let passwordHash: string;

  beforeAll(async () => {
    passwordHash = await argon2PasswordHasher.hash(exactPassword);
  });

  it("creates an Argon2id hash and verifies the exact password", async () => {
    expect(passwordHash).toMatch(/^\$argon2id\$/u);

    await expect(argon2PasswordHasher.verify(passwordHash, exactPassword)).resolves.toBe(true);
  });

  it("does not trim, normalize, or change the submitted password", async () => {
    await expect(argon2PasswordHasher.verify(passwordHash, exactPassword.trim())).resolves.toBe(
      false,
    );

    await expect(
      argon2PasswordHasher.verify(passwordHash, exactPassword.normalize("NFD")),
    ).resolves.toBe(false);
  });

  it("rejects an incorrect password", async () => {
    await expect(
      argon2PasswordHasher.verify(passwordHash, "a-completely-different-password"),
    ).resolves.toBe(false);
  });

  it("uses a new random salt for each generated hash", async () => {
    const secondHash = await argon2PasswordHasher.hash(exactPassword);

    expect(secondHash).toMatch(/^\$argon2id\$/u);
    expect(secondHash).not.toBe(passwordHash);

    await expect(argon2PasswordHasher.verify(secondHash, exactPassword)).resolves.toBe(true);
  });
});
