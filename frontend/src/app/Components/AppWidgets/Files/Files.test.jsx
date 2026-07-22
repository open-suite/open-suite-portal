import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import Files from "./Files";

const useFetchWithRefresh = vi.fn();

vi.mock("@/app/Common/CustomHooks/useFetchWithRefresh", () => ({
  useFetchWithRefresh: (...args) => useFetchWithRefresh(...args),
}));

vi.mock("@/app/Common/CustomHooks/useLocalStorage", () => ({
  useLocalStorage: () => [false, vi.fn()],
}));

vi.mock("antd", () => ({
  Avatar: ({ children }) => <span>{children}</span>,
}));

vi.mock("@ant-design/icons", () => ({
  FileExcelOutlined: () => null,
  FileImageOutlined: () => null,
  FileOutlined: () => null,
  FilePptOutlined: () => null,
  FileWordOutlined: () => null,
}));

vi.mock("@/app/Common/Widget", () => ({
  default: function MockWidget({ children }) {
    return <div>{children}</div>;
  },
}));

vi.mock("@/app/Common/CustomList", () => {
  function Item({ children }) {
    return <div>{children}</div>;
  }
  Item.Meta = function Meta({ title }) {
    return <div>{title}</div>;
  };
  function CustomList({ dataSource, renderItem }) {
    return <div>{dataSource.map(renderItem)}</div>;
  }
  CustomList.Item = Item;
  return { default: CustomList };
});

describe("Files", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useFetchWithRefresh.mockReturnValue({
      data: {
        results: [
          {
            files: [
              {
                id: 1394,
                name: "report.docx",
                path: "Documents/report.docx",
                link: "https://nextcloud.example.com/f/1394",
                // Older cached responses may still contain this retired field.
                direct_edit_link: "/api/v1/ocs/files/1394/direct-edit",
              },
              {
                id: null,
                name: "notes.txt",
                path: "Documents/notes.txt",
                link: "https://nextcloud.example.com/f/456",
                direct_edit_link: null,
              },
            ],
          },
        ],
      },
      loading: false,
      error: "",
      onRefresh: vi.fn(),
    });
  });

  it("opens the selected DOCX by its durable file link", () => {
    render(<Files app={{ id: "ocs", title: "Files" }} />);

    const selectedFile = screen.getByRole("link", { name: "report.docx" });
    expect(selectedFile).toHaveAttribute(
      "href",
      "https://nextcloud.example.com/f/1394",
    );
    expect(selectedFile).toHaveAttribute("target", "_blank");
    expect(selectedFile).toHaveAttribute("rel", "noopener noreferrer");
    expect(screen.getByRole("link", { name: "notes.txt" })).toHaveAttribute(
      "href",
      "https://nextcloud.example.com/f/456",
    );
    expect(useFetchWithRefresh).toHaveBeenCalledOnce();
    expect(useFetchWithRefresh.mock.calls[0][0]).toBe("/ocs/activities");
  });
});
