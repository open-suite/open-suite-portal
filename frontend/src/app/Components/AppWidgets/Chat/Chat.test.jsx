import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import Chat from "./Chat";
import {
  getMatrixSession,
  runUnreadSync,
  startMatrixLogin,
} from "@/lib/matrix";

vi.mock("next/link", () => ({
  default: ({ children, ...props }) => <a {...props}>{children}</a>,
}));

vi.mock("@/i18n/TranslationsProvider", () => ({
  useTranslations: () => (key) => key,
}));

vi.mock("@/lib/matrix", () => ({
  MATRIX_ELEMENT: "https://chat.example.test",
  getCachedUnreadRooms: vi.fn(() => []),
  getMatrixSession: vi.fn(),
  runUnreadSync: vi.fn(),
  startMatrixLogin: vi.fn(),
}));

describe("Chat", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("stays passive and links directly to Element when there is no session", () => {
    getMatrixSession.mockReturnValue(null);

    render(<Chat />);

    expect(screen.getByText("disconnected")).toBeVisible();
    expect(screen.getByRole("link", { name: "openChat" })).toHaveAttribute(
      "href",
      "https://chat.example.test",
    );
    expect(startMatrixLogin).not.toHaveBeenCalled();
    expect(runUnreadSync).not.toHaveBeenCalled();
  });

  it("returns to the passive card without navigating when sync is unauthorized", async () => {
    getMatrixSession.mockReturnValue({ userId: "@ada:example.test" });
    runUnreadSync.mockRejectedValue(
      Object.assign(new Error("Matrix session expired"), { code: 401 }),
    );

    render(<Chat />);

    expect(await screen.findByText("disconnected")).toBeVisible();
    expect(startMatrixLogin).not.toHaveBeenCalled();
    expect(screen.getByRole("link", { name: "openChat" })).toHaveAttribute(
      "href",
      "https://chat.example.test",
    );
  });

  it("stops the active Matrix sync when the widget unmounts", async () => {
    getMatrixSession.mockReturnValue({ userId: "@ada:example.test" });
    runUnreadSync.mockReturnValue(new Promise(() => {}));

    const { unmount } = render(<Chat />);
    await waitFor(() => expect(runUnreadSync).toHaveBeenCalledOnce());
    const { signal } = runUnreadSync.mock.calls[0][0];

    unmount();

    expect(signal.aborted).toBe(true);
  });
});
