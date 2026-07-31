import { GitFork, LayoutDashboard, Users } from "lucide-react";
import { Link, NavLink, useLocation } from "react-router-dom";

type CampaignWorkspaceTabsProps = {
  campaignId: string;
};

const workspaceSections = [
  { icon: LayoutDashboard, label: "Overview", path: "" },
  { icon: Users, label: "Entities", path: "entities" },
  { icon: GitFork, label: "Relationships", path: "relationships" },
] as const;

export function CampaignWorkspaceTabs({ campaignId }: CampaignWorkspaceTabsProps) {
  const { pathname } = useLocation();

  return (
    <nav aria-label="Campaign Workspace" className="campaign-workspace-sidebar">
      <p className="campaign-workspace-sidebar-label">Workspace navigation</p>
      <div className="campaign-workspace-sidebar-links">
        {workspaceSections.map((section) => {
          const Icon = section.icon;
          const destination = section.path ? `/campaigns/${campaignId}/${section.path}` : `/campaigns/${campaignId}`;
          const isRelationshipTypeRoute =
            section.path === "relationships" && pathname.startsWith(`/campaigns/${campaignId}/relationship-types`);

          if (isRelationshipTypeRoute) {
            return (
              <Link
                key={section.label}
                aria-current="page"
                className="campaign-workspace-sidebar-link campaign-workspace-sidebar-link-active"
                to={destination}
              >
                <Icon aria-hidden="true" size={16} strokeWidth={2} />
                {section.label}
              </Link>
            );
          }

          return (
            <NavLink
              key={section.label}
              className={({ isActive }) =>
                isActive
                  ? "campaign-workspace-sidebar-link campaign-workspace-sidebar-link-active"
                  : "campaign-workspace-sidebar-link"
              }
              end={!section.path}
              to={destination}
            >
              <Icon aria-hidden="true" size={16} strokeWidth={2} />
              {section.label}
            </NavLink>
          );
        })}
      </div>
    </nav>
  );
}
