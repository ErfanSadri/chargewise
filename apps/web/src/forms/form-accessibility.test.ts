import { describe, expect, it } from "vitest";

import { focusFirstInvalidFormControl, getInvalidFieldNames } from "./form-accessibility.ts";

describe("form accessibility helpers", () => {
  it("keeps unique invalid field names in issue order", () => {
    expect([
      ...getInvalidFieldNames([
        { path: ["email"] },
        { path: ["password"] },
        { path: ["email"] },
        { path: [] },
      ]),
    ]).toEqual(["email", "password"]);
  });

  it("focuses the first named invalid control", async () => {
    const form = document.createElement("form");
    const email = document.createElement("input");
    const password = document.createElement("input");

    email.name = "email";
    password.name = "password";
    form.append(email, password);
    document.body.append(form);

    focusFirstInvalidFormControl(form, ["password", "email"]);

    await Promise.resolve();

    expect(password).toHaveFocus();
  });
});
