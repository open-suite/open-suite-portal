import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import Projects from "./Projects";

const useFetchWithRefresh = vi.fn();
vi.mock("@/app/Common/CustomHooks/useFetchWithRefresh", () => ({
  useFetchWithRefresh: (...args) => useFetchWithRefresh(...args),
}));
vi.mock("antd", () => ({ Avatar: ({ children }) => <span>{children}</span> }));
vi.mock("@ant-design/icons", () => ({ ProjectOutlined: () => null }));
vi.mock("@/app/Common/Widget", () => ({
  default: function MockWidget({ children }) {
    return <div>{children}</div>;
  },
}));
vi.mock("@/app/Common/CustomList", () => {
  function Item({ children }) {
    return <div>{children}</div>;
  }
  Item.Meta = function Meta({ title, description }) {
    return (
      <div>
        {title}
        <span>{description}</span>
      </div>
    );
  };
  function List({ dataSource, renderItem }) {
    return <div>{dataSource.map(renderItem)}</div>;
  }
  List.Item = Item;
  return { default: List };
});

describe("Projects", () => {
  beforeEach(() => {
    useFetchWithRefresh.mockReturnValue({
      data: [
        {
          id: 1,
          title: "Alpha",
          card_count: 8,
          completed_count: 3,
          link: "https://cloud.test/apps/deck/board/1",
        },
        {
          id: 2,
          title: "Beta",
          card_count: 2,
          completed_count: 2,
          link: "https://cloud.test/apps/deck/board/2",
        },
        {
          id: 3,
          title: "Gamma",
          card_count: 0,
          completed_count: 0,
          link: "https://cloud.test/apps/deck/board/3",
        },
        {
          id: 4,
          title: "Hidden",
          card_count: 1,
          completed_count: 0,
          link: "https://cloud.test/apps/deck/board/4",
        },
      ],
      loading: false,
      error: "",
      onRefresh: vi.fn(),
    });
  });

  it("loads Deck projects and renders at most three durable board links", () => {
    render(<Projects app={{ id: "projects", title: "Projects" }} />);
    expect(useFetchWithRefresh).toHaveBeenCalledWith("/ocs/projects");
    expect(screen.getAllByRole("link")).toHaveLength(3);
    expect(screen.getByRole("link", { name: "Alpha" })).toHaveAttribute(
      "href",
      "https://cloud.test/apps/deck/board/1",
    );
    expect(screen.getByText("3 of 8 cards done")).toBeInTheDocument();
    expect(screen.queryByText("Hidden")).not.toBeInTheDocument();
  });
});
