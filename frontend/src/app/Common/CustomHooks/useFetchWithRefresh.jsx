import { useState, useCallback, useEffect, useMemo, useRef } from "react";
import api from "@/lib/axios";
import { useAutoRefresh } from "./useAutoRefresh";
import { attemptSilentLoginOrLogin } from "@/lib/silentLogin";

export function useFetchWithRefresh(url, params = {}, { enabled = true } = {}) {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const latestRequest = useRef(0);
  const latestInteractiveRequest = useRef(0);

  // Build URL with query parameters
  const fullUrl = useMemo(() => {
    if (!params || Object.keys(params).length === 0) {
      return url;
    }

    const queryString = Object.entries(params)
      .filter(
        ([, value]) => value !== undefined && value !== null && value !== "",
      )
      .map(([key, value]) => `${key}=${encodeURIComponent(value)}`)
      .join("&");

    return queryString ? `${url}?${queryString}` : url;
  }, [url, params]);

  // Fetch function
  const fetchData = useCallback(
    async (isAutoRefresh = false) => {
      if (!enabled) return;
      const request = ++latestRequest.current;
      if (!isAutoRefresh) {
        latestInteractiveRequest.current = request;
        setLoading(true);
      }
      try {
        const res = await api.get(fullUrl);
        if (request === latestRequest.current) {
          setData(res.data);
          setError("");
        }
      } catch (err) {
        // Only set error if it's NOT an auto-refresh
        if (!isAutoRefresh && request === latestRequest.current) {
          setError(err.message);
        }
        attemptSilentLoginOrLogin(err);
      } finally {
        if (!isAutoRefresh && request === latestInteractiveRequest.current) {
          setLoading(false);
        }
      }
    },
    [enabled, fullUrl],
  );

  useEffect(() => {
    if (!enabled) return;
    fetchData(false);
    return () => {
      latestRequest.current += 1;
      latestInteractiveRequest.current = latestRequest.current;
    };
  }, [enabled, fetchData]);

  // Auto-refresh fetch that doesn't set errors
  const autoRefreshFetch = useCallback(() => {
    fetchData(true);
  }, [fetchData]);

  // Auto-refresh every specified interval
  useAutoRefresh(autoRefreshFetch, 30000);

  return {
    data,
    loading,
    error,
    onRefresh: () => fetchData(false),
  };
}
