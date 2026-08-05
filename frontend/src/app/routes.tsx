import { createBrowserRouter, type RouteObject } from "react-router-dom";

import { AppShell } from "./AppShell";
import { CampaignEntitiesTab } from "../routes/CampaignEntitiesTab";
import { CampaignAssetsTab } from "../routes/CampaignAssetsTab";
import { CampaignSessionsTab } from "../routes/CampaignSessionsTab";
import { AssetDetailPage } from "../routes/AssetDetailPage";
import { AssetEditPage } from "../routes/AssetEditPage";
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
import { RelationshipTypeCreatePage } from "../routes/RelationshipTypeCreatePage";
import { SessionDetailPage } from "../routes/SessionDetailPage";
import { SessionFormPage } from "../routes/SessionFormPage";

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
            path: "sessions",
            children: [
              { index: true, element: <CampaignSessionsTab /> },
              { path: "new", element: <SessionFormPage mode="create" /> },
              { path: ":sessionId", element: <SessionDetailPage /> },
              { path: ":sessionId/edit", element: <SessionFormPage mode="edit" /> },
            ],
          },
          {
            path: "assets",
            children: [
              { index: true, element: <CampaignAssetsTab /> },
              { path: ":assetId", element: <AssetDetailPage /> },
              { path: ":assetId/edit", element: <AssetEditPage /> },
            ],
          },
          {
            path: "edit",
            element: <CampaignFormPage mode="edit" />,
          },
          {
            path: "relationship-types",
            children: [
              { index: true, element: <RelationshipTypeManagementPage /> },
              { path: "new", element: <RelationshipTypeCreatePage /> },
            ],
          },
        ],
      },
    ],
  },
];

export const router = createBrowserRouter(routes);
