import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { exchangeLoginToken } from "@/lib/matrix";
import MatrixCallback, { returnToDashboard } from "./page";

vi.mock("@/lib/matrix", () => ({
  exchangeLoginToken: vi.fn(),
}));

describe("MatrixCallback", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.history.replaceState({}, "", "/matrix-callback");
  });

  it("uses a document navigation to return from the static callback page", () => {
    const location = { replace: vi.fn() };

    returnToDashboard(location);

    expect(location.replace).toHaveBeenCalledWith("/");
  });

  it("reports a callback without a login token", async () => {
    render(<MatrixCallback />);

    expect(await screen.findByText("No login token returned.")).toBeVisible();

    expect(exchangeLoginToken).not.toHaveBeenCalled();
  });

  it("reports a failed user-initiated login token exchange", async () => {
    window.history.replaceState(
      {},
      "",
      "/matrix-callback?loginToken=invalid-token",
    );
    exchangeLoginToken.mockRejectedValue(
      new Error("Matrix login failed (401)"),
    );

    render(<MatrixCallback />);

    expect(await screen.findByText("Chat connection failed")).toBeVisible();
    expect(screen.getByText("Matrix login failed (401)")).toBeVisible();
  });
});
