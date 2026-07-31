import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { useLocalStorageState } from "../hooks/useLocalStorageState";

function LocalStorageValue({ storageKey }: { storageKey: string }) {
  const [value] = useLocalStorageState(storageKey);

  return <output>{value}</output>;
}

describe("useLocalStorageState", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  afterEach(() => {
    window.localStorage.clear();
  });

  it("reads the saved value during the first render", () => {
    window.localStorage.setItem("quick-notes:campaign-1", "Keep the harbor watch alert.");

    expect(renderToString(<LocalStorageValue storageKey="quick-notes:campaign-1" />)).toContain(
      "Keep the harbor watch alert.",
    );
  });
});
