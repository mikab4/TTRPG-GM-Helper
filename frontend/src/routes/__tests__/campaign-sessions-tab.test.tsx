import { act, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { CampaignWorkspaceContext } from "../CampaignWorkspacePage";
import type { CampaignSession } from "../../types/sessions";

const mockUseOutletContext = vi.fn<() => CampaignWorkspaceContext>();
const listSessions = vi.fn<() => Promise<CampaignSession[]>>();
let resolveSessionList: (sessions: CampaignSession[]) => void;

const session: CampaignSession = {
  campaignId: "campaign-1",
  createdAt: "2026-08-06T00:00:00Z",
  id: "session-4",
  playedOn: "2026-08-04",
  sessionLabel: "The Sunken Archive",
  sessionNumber: 4,
  summary: "The party recovered the drowned atlas.",
  updatedAt: "2026-08-06T00:00:00Z",
};

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual<typeof import("react-router-dom")>("react-router-dom");
  return { ...actual, useOutletContext: () => mockUseOutletContext() };
});

vi.mock("../../api/sessions", () => ({
  deleteSession: vi.fn(),
  listSessions,
}));

async function renderSessionsTab() {
  mockUseOutletContext.mockReturnValue({
    campaign: {
      createdAt: "2026-08-06T00:00:00Z",
      description: "",
      id: "campaign-1",
      name: "The Shattered Coast",
      ownerId: "owner-1",
      updatedAt: "2026-08-06T00:00:00Z",
    },
  });
  listSessions.mockImplementation(
    () =>
      new Promise<CampaignSession[]>((resolve) => {
        resolveSessionList = resolve;
      }),
  );

  const { CampaignSessionsTab } = await import("../CampaignSessionsTab");
  render(
    <MemoryRouter>
      <CampaignSessionsTab />
    </MemoryRouter>,
  );
  await act(async () => {
    resolveSessionList([session]);
    await Promise.resolve();
  });
}

describe("CampaignSessionsTab", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("opens the session from its card and keeps Edit beside Delete", async () => {
    await renderSessionsTab();

    expect(await screen.findByRole("link", { name: "Open The Sunken Archive" })).toHaveAttribute(
      "href",
      "/campaigns/campaign-1/sessions/session-4",
    );
    expect(screen.getByRole("link", { name: "Edit" })).toHaveAttribute(
      "href",
      "/campaigns/campaign-1/sessions/session-4/edit",
    );
    expect(screen.getByRole("button", { name: "Delete" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "View Session →" })).not.toBeInTheDocument();
  });
});
