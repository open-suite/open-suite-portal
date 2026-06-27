"use client";
import { createContext, useContext, useState, useEffect } from "react";
import api from "@/lib/axios";
import StartLoading from "../../Common/StartLoading";
import { attemptSilentLoginOrLogin } from "../../../lib/silentLogin";

const AppContext = createContext();

export function AppProvider({ children }) {
  const [appConfig, setAppConfig] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  useEffect(() => {
    const fetchConfig = async () => {
      let redirectingToLogin = false;
      try {
        const res = await api.get("/config");
        setAppConfig(res?.data);
      } catch (err) {
        setError(err?.response);
        attemptSilentLoginOrLogin(err);
        redirectingToLogin = err?.response?.status === 401;
      } finally {
        if (!redirectingToLogin) setLoading(false);
      }
    };
    fetchConfig();
  }, []);

  return (
    <StartLoading loading={loading}>
      <AppContext.Provider value={{ appConfig, error }}>
        {children}
      </AppContext.Provider>
    </StartLoading>
  );
}

export function useAppContext() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useAppContext must be used within AppProvider");
  return ctx;
}
