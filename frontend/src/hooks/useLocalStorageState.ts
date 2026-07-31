import { useEffect, useState } from "react";

export function useLocalStorageState(storageKey: string, initialValue = "") {
  const [value, setValue] = useState(() => window.localStorage.getItem(storageKey) ?? initialValue);

  useEffect(() => {
    window.localStorage.setItem(storageKey, value);
  }, [storageKey, value]);

  return [value, setValue] as const;
}
