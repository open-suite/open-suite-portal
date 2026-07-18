import { render, waitFor } from "@testing-library/react";
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

  it("starts Matrix login when the portal user has no chat session", async () => {
    getMatrixSession.mockReturnValue(null);

    render(<Chat />);

    await waitFor(() => expect(startMatrixLogin).toHaveBeenCalledOnce());
    expect(runUnreadSync).not.toHaveBeenCalled();
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
