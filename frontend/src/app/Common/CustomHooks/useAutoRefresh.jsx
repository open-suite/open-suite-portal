import { useEffect, useRef } from "react";

export function useAutoRefresh(fetchFunction, interval = 30000) {
  // Store refs for cleanup
  const timeoutIdRef = useRef(null);
  const intervalIdRef = useRef(null);
  const initialDelayRef = useRef(null);

  useEffect(() => {
    // Generate random delay only once, on first effect run
    if (initialDelayRef.current === null) {
      initialDelayRef.current = interval + Math.floor(Math.random() * interval);
    }

    // Set up the first delayed interval to stagger API calls. Initial data
    // loads are owned by the caller so this hook does not double-fetch on mount.
    timeoutIdRef.current = setTimeout(() => {
      // After the random delay, start the regular interval
      fetchFunction();

      intervalIdRef.current = setInterval(() => {
        fetchFunction();
      }, interval);
    }, initialDelayRef.current);

    // Cleanup: clear both timeout and interval when component unmounts or dependencies change
    return () => {
      if (timeoutIdRef.current) {
        clearTimeout(timeoutIdRef.current);
      }
      if (intervalIdRef.current) {
        clearInterval(intervalIdRef.current);
      }
    };
  }, [fetchFunction, interval]);
}
