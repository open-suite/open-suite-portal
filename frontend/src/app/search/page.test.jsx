import { act, fireEvent, render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import api from "@/lib/axios";
import SearchPage from "./page";

vi.mock("@/lib/axios", () => ({ default: { get: vi.fn() } }));
vi.mock("../Components/Context/AppContext", () => ({
  useAppContext: () => ({
    appConfig: {
      applications: [
        { id: "ocs", url: "https://files.test" },
        { id: "docs", url: "https://wiki.test" },
      ],
    },
  }),
}));

it("drops a preview when Files no longer returns the link and ignores an abandoned Wiki request", async () => {
  const file = { name: "Plan draft", link: "https://files.test/plan" };
  api.get
    .mockResolvedValueOnce({ data: { results: [{ files: [file] }] } })
    .mockResolvedValueOnce({ data: { results: [] } });
  render(<SearchPage />);
  const input = screen.getByPlaceholderText("Search Files and Wiki…");
  const edit = (value) => fireEvent.change(input, { target: { value } });
  const submit = () =>
    fireEvent.click(screen.getByRole("button", { name: "Search" }));
  edit("Plan");
  submit();
  await screen.findByText(/1 results shown/);
  edit("Plan dr");
  expect(screen.getByText("Plan draft").closest("a")).toHaveAttribute(
    "href",
    file.link,
  );
  expect(api.get).toHaveBeenCalledTimes(2);
  let finishWiki;
  api.get
    .mockResolvedValueOnce({ data: { results: [] } })
    .mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finishWiki = resolve;
        }),
    );
  await act(async () => submit());
  expect(screen.queryByText("Plan draft")).toBeNull();
  edit("Different");
  await act(async () =>
    finishWiki({
      data: { results: [{ title: "Stale", url: "https://wiki.test/stale" }] },
    }),
  );
  expect(screen.queryByText("Stale")).toBeNull();
});
