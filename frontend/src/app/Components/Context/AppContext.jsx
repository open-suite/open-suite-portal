"use client";
import { createContext, useContext, useState, useEffect } from "react";
import api from "@/lib/axios";
import {
  attemptSilentLoginOrLogin,
  clearLoginAttempt,
  hasNativeOidcError,
} from "../../../lib/silentLogin";

const AppContext = createContext();

export function AppProvider({ children }) {
  const [appConfig, setAppConfig] = useState(null);
  const [authFailure, setAuthFailure] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  useEffect(() => {
    if (hasNativeOidcError()) {
      setAuthFailure(true);
      setLoading(false);
      return;
    }

    const fetchConfig = async () => {
      let redirectingToLogin = false;
      try {
        const res = await api.get("/config");
        setAppConfig(res?.data);
        clearLoginAttempt();
      } catch (err) {
        setError(err?.response);
        redirectingToLogin = attemptSilentLoginOrLogin(err);
        if (err?.response?.status === 401 && !redirectingToLogin) {
          setAuthFailure(true);
        }
      } finally {
        if (!redirectingToLogin) setLoading(false);
      }
    };
    fetchConfig();
  }, []);

  return (
    <AppContext.Provider value={{ appConfig, authFailure, error, loading }}>
      {children}
    </AppContext.Provider>
  );
}

export function useAppContext() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useAppContext must be used within AppProvider");
  return ctx;
}
