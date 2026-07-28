import { createBrowserRouter, type RouteObject } from "react-router-dom";

import { AppShell } from "./AppShell";
import { CampaignEntitiesTab } from "../routes/CampaignEntitiesTab";
import { CampaignFormPage } from "../routes/CampaignFormPage";
import { CampaignOverviewTab } from "../routes/CampaignOverviewTab";
import { CampaignRelationshipsTab } from "../routes/CampaignRelationshipsTab";
import { CampaignWorkspacePage } from "../routes/CampaignWorkspacePage";
import { CampaignsPage } from "../routes/CampaignsPage";
import { EntityDetailPage } from "../routes/EntityDetailPage";
import { EntityEditPage } from "../routes/EntityEditPage";
import { EntityFormPage } from "../routes/EntityFormPage";
import { RelationshipFormPage } from "../routes/RelationshipFormPage";
import { RelationshipTypeManagementPage } from "../routes/RelationshipTypeManagementPage";

export const routes: RouteObject[] = [
  {
    path: "/",
    element: <AppShell />,
    children: [
      {
        index: true,
        element: <CampaignsPage />,
      },
      {
        path: "campaigns",
        element: <CampaignsPage />,
      },
      {
        path: "campaigns/new",
        element: <CampaignFormPage mode="create" />,
      },
      {
        path: "campaigns/:campaignId",
        element: <CampaignWorkspacePage />,
        children: [
          {
            index: true,
            element: <CampaignOverviewTab />,
          },
          {
            path: "entities",
            children: [
              {
                index: true,
                element: <CampaignEntitiesTab />,
              },
              {
                path: "new",
                element: <EntityFormPage source="campaign" />,
              },
              {
                path: ":entityId",
                element: <EntityDetailPage />,
              },
              {
                path: ":entityId/edit",
                element: <EntityEditPage />,
              },
            ],
          },
          {
            path: "relationships",
            children: [
              {
                index: true,
                element: <CampaignRelationshipsTab />,
              },
              {
                path: "new",
                element: <RelationshipFormPage mode="create" />,
              },
              {
                path: ":relationshipId/edit",
                element: <RelationshipFormPage mode="edit" />,
              },
            ],
          },
          {
            path: "edit",
            element: <CampaignFormPage mode="edit" />,
          },
          {
            path: "relationship-types",
            element: <RelationshipTypeManagementPage />,
          },
        ],
      },
    ],
  },
];

export const router = createBrowserRouter(routes);
