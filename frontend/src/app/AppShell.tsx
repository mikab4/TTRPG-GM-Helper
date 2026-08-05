import { ChevronDown } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Link, Outlet, useLocation } from "react-router-dom";

import { applyEntityTypeMigration, getEntityTypeCompatibilityReport } from "../api/compatibility";
import { listCampaigns } from "../api/campaigns";
import { CompatibilityMigrationPanel } from "../components/CompatibilityMigrationPanel";
import { CampaignDirectoryProvider } from "./CampaignDirectoryContext";
import { UnsavedChangesProvider } from "./UnsavedChangesContext";
import { UnsavedChangesGuard } from "./UnsavedChangesGuard";
import type {
  EntityTypeCompatibilityReport,
  EntityTypeMigrationMapping,
  EntityTypeMigrationResult,
} from "../types/compatibility";
import type { Campaign } from "../types/campaigns";

type CompatibilityState =
  | { status: "loading" }
  | { status: "error" }
  | { report: EntityTypeCompatibilityReport; status: "ready" };

type CampaignListState = { status: "loading" } | { status: "error" } | { campaigns: Campaign[]; status: "ready" };

export function getCampaignSwitcherPath(currentPathname: string, campaignId: string): string {
  if (/^\/campaigns\/[^/]+\/relationship-types(?:\/|$)/.test(currentPathname)) {
    return `/campaigns/${campaignId}/relationships`;
  }

  const workspaceSectionMatch = currentPathname.match(
    /^\/campaigns\/[^/]+\/(entities|relationships|sessions|assets)(?:\/|$)/,
  );

  if (workspaceSectionMatch === null) {
    return `/campaigns/${campaignId}`;
  }

  return `/campaigns/${campaignId}/${workspaceSectionMatch[1]}`;
}

export function AppShell() {
  const location = useLocation();
  const [compatibilityState, setCompatibilityState] = useState<CompatibilityState>({
    status: "loading",
  });
  const [campaignListState, setCampaignListState] = useState<CampaignListState>({ status: "loading" });
  const [migrationError, setMigrationError] = useState<string | null>(null);
  const [migrationResult, setMigrationResult] = useState<EntityTypeMigrationResult | null>(null);
  const [isMigrating, setIsMigrating] = useState(false);
  const [isCampaignMenuOpen, setIsCampaignMenuOpen] = useState(false);
  const campaignSwitcherRef = useRef<HTMLDivElement>(null);

  const refreshCampaigns = useCallback(async () => {
    try {
      const campaigns = await listCampaigns();
      setCampaignListState({ campaigns, status: "ready" });
    } catch {
      setCampaignListState({ status: "error" });
    }
  }, []);

  useEffect(() => {
    const abortController = new AbortController();

    async function loadCompatibilityReport() {
      try {
        const report = await getEntityTypeCompatibilityReport({ signal: abortController.signal });
        setCompatibilityState({ report, status: "ready" });
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") {
          return;
        }

        setCompatibilityState({ status: "error" });
      }
    }

    void loadCompatibilityReport();

    return () => {
      abortController.abort();
    };
  }, []);

  useEffect(() => {
    void refreshCampaigns();
  }, [refreshCampaigns]);

  useEffect(() => {
    if (!isCampaignMenuOpen) {
      return;
    }

    function closeCampaignMenuWhenPressingOutside(event: PointerEvent) {
      if (event.target instanceof Node && !campaignSwitcherRef.current?.contains(event.target)) {
        setIsCampaignMenuOpen(false);
      }
    }

    document.addEventListener("pointerdown", closeCampaignMenuWhenPressingOutside);

    return () => {
      document.removeEventListener("pointerdown", closeCampaignMenuWhenPressingOutside);
    };
  }, [isCampaignMenuOpen]);

  async function handleApplyEntityTypeMigration(mappings: EntityTypeMigrationMapping[]): Promise<void> {
    setIsMigrating(true);
    setMigrationError(null);

    try {
      const result = await applyEntityTypeMigration(mappings);
      setMigrationResult(result);
      const report = await getEntityTypeCompatibilityReport();
      setCompatibilityState({ report, status: "ready" });
    } catch (error) {
      setMigrationError(error instanceof Error ? error.message : "Unknown migration failure.");
    } finally {
      setIsMigrating(false);
    }
  }

  const activeCampaignId = location.pathname.match(/^\/campaigns\/([^/]+)/)?.[1];
  const activeCampaign =
    campaignListState.status === "ready"
      ? campaignListState.campaigns.find((campaign) => campaign.id === activeCampaignId)
      : undefined;

  return (
    <UnsavedChangesProvider>
      <CampaignDirectoryProvider value={{ refreshCampaigns }}>
        <UnsavedChangesGuard />
        <div className="shell">
          <header className="shell-header">
            <div className="shell-header-content">
              <p className="shell-brand">Campaign Workspace</p>
              <div ref={campaignSwitcherRef} className="campaign-switcher">
                <button
                  aria-label="Select campaign"
                  aria-expanded={isCampaignMenuOpen}
                  aria-haspopup="menu"
                  className="campaign-switcher-button"
                  type="button"
                  onClick={() => {
                    setIsCampaignMenuOpen((isOpen) => !isOpen);
                  }}
                >
                  <span className="campaign-switcher-name">{activeCampaign?.name ?? "Select a campaign"}</span>
                  <span className="campaign-switcher-kind">
                    Campaign
                    <ChevronDown aria-hidden="true" size={14} strokeWidth={2.3} />
                  </span>
                </button>
                {isCampaignMenuOpen ? (
                  <div aria-label="Campaign switcher" className="campaign-switcher-menu" role="menu">
                    <p>Select active campaign</p>
                    {campaignListState.status === "loading" ? (
                      <span className="campaign-switcher-status">Loading campaigns…</span>
                    ) : null}
                    {campaignListState.status === "error" ? (
                      <span className="campaign-switcher-status">Campaigns unavailable.</span>
                    ) : null}
                    {campaignListState.status === "ready"
                      ? campaignListState.campaigns.map((campaign) => (
                          <Link
                            key={campaign.id}
                            role="menuitem"
                            to={getCampaignSwitcherPath(location.pathname, campaign.id)}
                            onClick={() => {
                              setIsCampaignMenuOpen(false);
                            }}
                          >
                            {campaign.name}
                          </Link>
                        ))
                      : null}
                    <Link
                      role="menuitem"
                      to="/campaigns"
                      onClick={() => {
                        setIsCampaignMenuOpen(false);
                      }}
                    >
                      Campaign Registry
                    </Link>
                  </div>
                ) : null}
              </div>
            </div>
          </header>
          <div className="shell-body">
            <main className="shell-main">
              {compatibilityState.status === "loading" ? (
                <section className="panel compatibility-panel compatibility-loading-panel">
                  <h2 className="font-ui">Checking Data Compatibility</h2>
                  <p>Reviewing stored entity types before opening the workspace.</p>
                </section>
              ) : null}
              {compatibilityState.status === "ready" && compatibilityState.report.hasIssues ? (
                <CompatibilityMigrationPanel
                  migrationError={migrationError}
                  migrationResult={migrationResult}
                  report={compatibilityState.report}
                  submitting={isMigrating}
                  onSubmit={handleApplyEntityTypeMigration}
                />
              ) : null}
              {compatibilityState.status !== "loading" &&
              !(compatibilityState.status === "ready" && compatibilityState.report.hasIssues) ? (
                <Outlet />
              ) : null}
            </main>
          </div>
        </div>
      </CampaignDirectoryProvider>
    </UnsavedChangesProvider>
  );
}
