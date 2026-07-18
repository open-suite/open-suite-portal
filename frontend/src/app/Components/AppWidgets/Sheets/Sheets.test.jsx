import { act, render, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import api from "@/lib/axios";
import Sheets from "./Sheets";

vi.mock("@/lib/axios", () => ({
  default: { get: vi.fn() },
}));

vi.mock("antd", () => ({
  Avatar: ({ children }) => <span>{children}</span>,
  Divider: () => <hr />,
  Select: () => <select aria-label="organization" />,
}));

vi.mock("@ant-design/icons", () => ({
  EditOutlined: () => null,
  FileTextOutlined: () => null,
}));

vi.mock("next/link", () => ({
  default: ({ children, ...props }) => <a {...props}>{children}</a>,
}));

vi.mock("../../../Common/Widget", () => ({
  default: ({ children }) => <div>{children}</div>,
}));

vi.mock("../../../Common/CustomList", () => ({
  default: () => null,
}));

vi.mock("../../../../i18n/TranslationsProvider", () => ({
  useTranslations: () => (key) => key,
}));

function deferred() {
  let resolve;
  const promise = new Promise((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

describe("Sheets", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("waits for an organization before requesting documents", async () => {
    const orgRequest = deferred();
    api.get.mockImplementation((url) => {
      if (url === "/grist/orgs") return orgRequest.promise;
      return Promise.resolve({ data: { count: 0, results: [] } });
    });

    render(<Sheets app={{ id: "grist", title: "Sheets" }} />);

    await waitFor(() => expect(api.get).toHaveBeenCalledWith("/grist/orgs"));
    expect(api.get).toHaveBeenCalledTimes(1);

    await act(async () => {
      orgRequest.resolve({ data: [{ id: 7, name: "Research" }] });
      await orgRequest.promise;
    });

    await waitFor(() =>
      expect(api.get).toHaveBeenCalledWith(
        "/grist/docs?organization_id=7&page=1&page_size=3",
      ),
    );
  });

  it("replaces a stored organization that the next user cannot access", async () => {
    localStorage.setItem("sheets_selected_org", "99");
    api.get.mockImplementation((url) => {
      if (url === "/grist/orgs") {
        return Promise.resolve({ data: [{ id: 7, name: "Research" }] });
      }
      return Promise.resolve({ data: { count: 0, results: [] } });
    });

    render(<Sheets app={{ id: "grist", title: "Sheets" }} />);

    await waitFor(() =>
      expect(api.get).toHaveBeenCalledWith(
        "/grist/docs?organization_id=7&page=1&page_size=3",
      ),
    );
    expect(
      api.get.mock.calls.some(([url]) => url.includes("organization_id=99")),
    ).toBe(false);
    expect(localStorage.getItem("sheets_selected_org")).toBe("7");
  });
});
