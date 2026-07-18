import { act, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import api from "@/lib/axios";
import { attemptSilentLoginOrLogin } from "@/lib/silentLogin";
import { AppProvider, useAppContext } from "./AppContext";

vi.mock("@/lib/axios", () => ({
  default: { get: vi.fn() },
}));

vi.mock("@/lib/silentLogin", () => ({
  attemptSilentLoginOrLogin: vi.fn(),
}));

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function ContextProbe() {
  const { appConfig, error } = useAppContext();
  return (
    <div>
      <span>{appConfig?.applications?.[0]?.title}</span>
      <span>{error?.status}</span>
    </div>
  );
}

describe("AppProvider", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("keeps the bootstrap shell visible until config is ready", async () => {
    const request = deferred();
    api.get.mockReturnValue(request.promise);

    render(
      <AppProvider>
        <ContextProbe />
      </AppProvider>,
    );

    expect(screen.getByLabelText("Loading Open Suite")).toBeInTheDocument();
    expect(screen.queryByText("Documents")).not.toBeInTheDocument();

    await act(async () => {
      request.resolve({ data: { applications: [{ title: "Documents" }] } });
      await request.promise;
    });

    expect(screen.getByText("Documents")).toBeInTheDocument();
    expect(api.get).toHaveBeenCalledWith("/config");
  });

  it("exposes a non-authentication bootstrap error to the application", async () => {
    const error = { response: { status: 503 } };
    api.get.mockRejectedValue(error);

    render(
      <AppProvider>
        <ContextProbe />
      </AppProvider>,
    );

    expect(await screen.findByText("503")).toBeInTheDocument();
    expect(attemptSilentLoginOrLogin).toHaveBeenCalledWith(error);
    expect(
      screen.queryByLabelText("Loading Open Suite"),
    ).not.toBeInTheDocument();
  });

  it("keeps the bootstrap shell mounted while a 401 redirects to login", async () => {
    const error = { response: { status: 401 } };
    api.get.mockRejectedValue(error);

    render(
      <AppProvider>
        <ContextProbe />
      </AppProvider>,
    );

    expect(
      await screen.findByLabelText("Loading Open Suite"),
    ).toBeInTheDocument();
    expect(attemptSilentLoginOrLogin).toHaveBeenCalledWith(error);
    expect(screen.queryByText("401")).not.toBeInTheDocument();
  });
});
