// @vitest-environment node

import { describe, expect, it } from "vitest";

describe("i18n server bootstrap", () => {
  it("loads without browser globals during server rendering", async () => {
    const { getTranslations, INITIAL_LOCALE } = await import("./config");

    expect(INITIAL_LOCALE).toBe("en"); // English-only for now
    await expect(getTranslations(INITIAL_LOCALE)).resolves.toBeDefined();
    await expect(getTranslations("unsupported")).resolves.toBeDefined();
  });
});
