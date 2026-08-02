import { act, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import api from "@/lib/axios";
import {
  attemptSilentLoginOrLogin,
  clearLoginAttempt,
  hasNativeOidcError,
} from "@/lib/silentLogin";
import { AppProvider, useAppContext } from "./AppContext";

vi.mock("@/lib/axios", () => ({
  default: { get: vi.fn() },
}));

vi.mock("@/lib/silentLogin", () => ({
  attemptSilentLoginOrLogin: vi.fn(),
  clearLoginAttempt: vi.fn(),
  hasNativeOidcError: vi.fn(() => false),
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
  const { appConfig, authFailure, error, loading } = useAppContext();
  return (
    <div
      data-auth-failure={String(authFailure)}
      data-loading={String(loading)}
      data-testid="context"
    >
      <span>{appConfig?.applications?.[0]?.title}</span>
      <span>{error?.status}</span>
    </div>
  );
}

describe("AppProvider", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hasNativeOidcError.mockReturnValue(false);
  });

  it("keeps the bootstrap shell visible until config is ready", async () => {
    const request = deferred();
    api.get.mockReturnValue(request.promise);

    render(
      <AppProvider>
        <ContextProbe />
      </AppProvider>,
    );

    expect(screen.getByTestId("context")).toHaveAttribute(
      "data-loading",
      "true",
    );
    expect(screen.queryByText("Documents")).not.toBeInTheDocument();

    await act(async () => {
      request.resolve({ data: { applications: [{ title: "Documents" }] } });
      await request.promise;
    });

    expect(screen.getByText("Documents")).toBeInTheDocument();
    expect(screen.getByTestId("context")).toHaveAttribute(
      "data-loading",
      "false",
    );
    expect(api.get).toHaveBeenCalledWith("/config");
    expect(clearLoginAttempt).toHaveBeenCalledOnce();
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
    expect(screen.getByTestId("context")).toHaveAttribute(
      "data-loading",
      "false",
    );
  });

  it("keeps the bootstrap shell mounted while a 401 redirects to login", async () => {
    const error = { response: { status: 401 } };
    api.get.mockRejectedValue(error);
    attemptSilentLoginOrLogin.mockReturnValue(true);

    render(
      <AppProvider>
        <ContextProbe />
      </AppProvider>,
    );

    expect(await screen.findByTestId("context")).toHaveAttribute(
      "data-loading",
      "true",
    );
    expect(attemptSilentLoginOrLogin).toHaveBeenCalledWith(error);
    expect(screen.getByTestId("context")).toHaveAttribute(
      "data-auth-failure",
      "false",
    );
  });

  it("shows an actionable failure instead of starting a second automatic login", async () => {
    const error = { response: { status: 401 } };
    api.get.mockRejectedValue(error);
    attemptSilentLoginOrLogin.mockReturnValue(false);

    render(
      <AppProvider>
        <ContextProbe />
      </AppProvider>,
    );

    expect(await screen.findByTestId("context")).toHaveAttribute(
      "data-auth-failure",
      "true",
    );
    expect(attemptSilentLoginOrLogin).toHaveBeenCalledOnce();
  });

  it("exposes the native OIDC failure without probing config", async () => {
    hasNativeOidcError.mockReturnValue(true);

    render(
      <AppProvider>
        <ContextProbe />
      </AppProvider>,
    );

    expect(await screen.findByTestId("context")).toHaveAttribute(
      "data-auth-failure",
      "true",
    );
    expect(api.get).not.toHaveBeenCalled();
    expect(attemptSilentLoginOrLogin).not.toHaveBeenCalled();
  });
});
