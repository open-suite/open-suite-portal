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
                id: 123,
                name: "plan.whiteboard",
                path: "Boards/plan.whiteboard",
                link: "https://nextcloud.example.com/f/123",
                direct_edit_link:
                  "/api/v1/ocs/files/123/direct-edit?path=Boards%2Fplan.whiteboard",
              },
              {
                id: 456,
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

  it("does not mint during render and uses the broker only for eligible rows", () => {
    render(<Files app={{ id: "ocs", title: "Files" }} />);

    expect(
      screen.getByRole("link", { name: "plan.whiteboard" }),
    ).toHaveAttribute(
      "href",
      "/api/v1/ocs/files/123/direct-edit?path=Boards%2Fplan.whiteboard",
    );
    expect(screen.getByRole("link", { name: "notes.txt" })).toHaveAttribute(
      "href",
      "https://nextcloud.example.com/f/456",
    );
    expect(useFetchWithRefresh).toHaveBeenCalledOnce();
    expect(useFetchWithRefresh.mock.calls[0][0]).toBe("/ocs/activities");
  });
});
