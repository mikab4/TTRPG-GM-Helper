// Screen definitions: which app route matches which mockup view, the fake API
// for that route, and the selector map pairing mockup elements with app elements.
// `app: null` marks a mockup element the app does not implement; `mockup: null`
// marks an app element the mockup does not design. Both are reported as differences.
import type { Page } from "playwright";

import {
  campaignDirectory,
  compatibilityReportWithoutIssues,
  shatteredCoastCampaign,
  shatteredCoastEntities,
  shatteredCoastRelationships,
} from "./fixtures.ts";

export type ElementPair = {
  label: string;
  mockup: string | null;
  app: string | null;
};

/** Returns the JSON body for a fake API GET, or undefined when the route is not faked. */
export type FakeApi = (method: string, path: string) => unknown;

export type ScreenDefinition = {
  description: string;
  appPath: string;
  appReadySelector: string;
  prepareApp?: (page: Page) => Promise<void>;
  prepareMockup?: (page: Page) => Promise<void>;
  fakeApi: FakeApi;
  pairs: ElementPair[];
};

const campaignId = shatteredCoastCampaign.id;

const workspaceApi: FakeApi = (method, path) => {
  if (method !== "GET") {
    return undefined;
  }

  const routes: Record<string, unknown> = {
    "/compatibility/entity-types": compatibilityReportWithoutIssues,
    "/campaigns": campaignDirectory,
    [`/campaigns/${campaignId}`]: shatteredCoastCampaign,
    [`/campaigns/${campaignId}/entities`]: shatteredCoastEntities,
    [`/campaigns/${campaignId}/relationships`]: shatteredCoastRelationships,
  };

  return routes[path];
};

const shellPairs: ElementPair[] = [
  { label: "Header bar", mockup: ".app-header", app: ".shell-header" },
  { label: "Brand", mockup: ".brand", app: ".shell-brand" },
  { label: "Campaign switcher", mockup: ".campaign-switcher", app: ".campaign-switcher-button" },
  { label: "Campaign switcher name", mockup: ".campaign-switcher .active-campaign", app: ".campaign-switcher-name" },
  { label: "Sidebar", mockup: ".sidebar", app: ".campaign-workspace-sidebar" },
  { label: "Sidebar label", mockup: ".side-label", app: ".campaign-workspace-sidebar-label" },
  { label: "Active nav item", mockup: ".nav-button.active", app: ".campaign-workspace-sidebar-link-active" },
  { label: "Nav count pill", mockup: ".nav-button.active .pill", app: null },
];

export const screens: Record<string, ScreenDefinition> = {
  entities: {
    description: "Campaign Entities tab with the first entity selected",
    appPath: `/campaigns/${campaignId}/entities`,
    appReadySelector: ".entity-roster-card",
    prepareApp: async (page) => {
      await page.locator(".entity-roster-card").first().click();
      await page.locator(".quick-look-panel").waitFor();
    },
    fakeApi: workspaceApi,
    pairs: [
      ...shellPairs,
      { label: "Page title", mockup: "#entities .view-header h2", app: ".workspace-section-header h2" },
      { label: "Page subtitle", mockup: "#entities .view-header p", app: ".workspace-section-header p" },
      {
        label: "Subtitle campaign name",
        mockup: "#entities .view-header .active-campaign",
        app: ".workspace-campaign-name",
      },
      { label: "Add entity button", mockup: "#entities .add-button", app: ".workspace-section-header .primary-button" },
      { label: "List pane", mockup: ".entity-list-pane", app: ".campaign-entities-layout > .section-panel" },
      { label: "Search box", mockup: "#entities .search", app: ".workspace-search-field" },
      { label: "Search input", mockup: "#entity-search", app: ".workspace-search-field input" },
      { label: "Category filter chips", mockup: ".entity-category-filters", app: null },
      { label: "Selected list item", mockup: ".entity-list-item.selected", app: ".entity-roster-card-selected" },
      { label: "Unselected list item", mockup: ".entity-list-item:nth-child(2)", app: ".entity-roster-card:nth-child(2)" },
      {
        label: "List item icon",
        mockup: ".entity-list-item:nth-child(2) .item-icon",
        app: ".entity-roster-card:nth-child(2) .entity-roster-mark",
      },
      {
        label: "List item name",
        mockup: ".entity-list-item:nth-child(2) > div:nth-child(2) > div:first-child",
        app: ".entity-roster-card:nth-child(2) .entity-roster-title",
      },
      {
        label: "List item summary",
        mockup: ".entity-list-item:nth-child(2) > div:nth-child(2) > div:nth-child(2)",
        app: ".entity-roster-card:nth-child(2) .entity-roster-summary",
      },
      {
        label: "List item type badge",
        mockup: ".entity-list-item:nth-child(2) .entity-kind",
        app: ".entity-roster-card:nth-child(2) .entity-type-pill",
      },
      {
        label: "List item relationship pills",
        mockup: null,
        app: ".entity-roster-card:nth-child(1) .relationship-preview-list",
      },
      {
        label: "List item Edit/Delete links",
        mockup: null,
        app: ".entity-roster-card:nth-child(2) .entity-roster-actions",
      },
      { label: "Detail pane", mockup: ".entity-detail-pane", app: ".quick-look-panel" },
      { label: "Detail type badge", mockup: "#reader-kind-badge", app: ".quick-look-header .eyebrow" },
      { label: "Detail title", mockup: "#reader-title", app: ".quick-look-header h3" },
      { label: "Detail section heading", mockup: "#entity-reader-view h4", app: ".quick-look-section h4" },
      { label: "Detail body text", mockup: "#reader-desc", app: ".quick-look-section p" },
      { label: "Secret GM notes box", mockup: ".secret-note-box", app: null },
      {
        label: "Detail secondary button",
        mockup: "#entity-reader-view .btn-secondary",
        app: ".quick-look-actions .secondary-button",
      },
      {
        label: "Detail delete button",
        mockup: "#entity-reader-view .row-action-danger",
        app: ".quick-look-actions .danger-button",
      },
      { label: "Detail close button", mockup: null, app: ".quick-look-header .icon-button" },
    ],
  },
};
