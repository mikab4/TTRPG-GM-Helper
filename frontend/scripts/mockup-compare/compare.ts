// Compare an app screen with its view in docs/mockups/workspace-v1.html.
// Usage: npm run mockup:compare -- <screen> [--width <px>]...
// Writes screenshots and report.md to frontend/.mockup-compare/<screen>/.
// Exit code 1 means the comparison itself failed (missing selector, unfaked
// API request, page error); differences alone do not fail the run.
import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { parseArgs } from "node:util";

import { chromium, type Browser, type Page } from "playwright";
import { createServer } from "vite";

import { toWire } from "./fixtures.ts";
import { screens, type ElementPair, type ScreenDefinition } from "./screens.ts";

const DEFAULT_WIDTHS = [1440, 800, 390];
const VIEWPORT_HEIGHT = 900;
const SIZE_TOLERANCE_PX = 2;
const FAKE_API_BASE = "/mockup-api";

const MEASURED_PROPERTIES = [
  "display",
  "font-family",
  "font-size",
  "font-weight",
  "line-height",
  "letter-spacing",
  "text-transform",
  "color",
  "background-color",
  "background-image",
  "border-width",
  "border-style",
  "border-color",
  "border-radius",
  "box-shadow",
  "padding",
  "gap",
] as const;

type Measurement =
  | { found: false }
  | { found: true; visible: boolean; width: number; height: number; styles: Record<string, string> };

type Difference = { element: string; property: string; mockup: string; app: string };

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const frontendDirectory = path.resolve(scriptDirectory, "../..");
const mockupUrl = pathToFileURL(path.resolve(frontendDirectory, "../docs/mockups/workspace-v1.html")).href;
const outputRoot = path.resolve(frontendDirectory, ".mockup-compare");

function parseCommandLine(): { screenName: string; screen: ScreenDefinition; widths: number[] } {
  const { positionals, values } = parseArgs({
    allowPositionals: true,
    options: { width: { type: "string", multiple: true } },
  });
  const screenName = positionals[0];
  const screen = screenName ? screens[screenName] : undefined;

  if (!screenName || !screen) {
    const available = Object.keys(screens).join(", ");
    throw new Error(`Usage: npm run mockup:compare -- <screen> [--width <px>]. Screens: ${available}.`);
  }

  const extraWidths = (values.width ?? []).map((width) => {
    const parsed = Number(width);
    if (!Number.isInteger(parsed) || parsed < 200) {
      throw new Error(`Invalid --width value: ${width}`);
    }
    return parsed;
  });

  return { screenName, screen, widths: [...new Set([...DEFAULT_WIDTHS, ...extraWidths])] };
}

function watchForErrors(page: Page, pageName: string, errors: string[]): void {
  page.on("pageerror", (error) => {
    errors.push(`${pageName}: page error: ${error.message}`);
  });
  page.on("console", (message) => {
    if (message.type() === "error") {
      errors.push(`${pageName}: console error: ${message.text()}`);
    }
  });
}

async function measure(page: Page, selector: string | null): Promise<Measurement | null> {
  if (selector === null) {
    return null;
  }

  return page.evaluate(
    ({ selector: elementSelector, properties }) => {
      const element = document.querySelector(elementSelector);
      if (!element) {
        return { found: false } as const;
      }

      const computed = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      const styles: Record<string, string> = {};
      for (const property of properties) {
        styles[property] = computed.getPropertyValue(property);
      }

      return {
        found: true,
        visible: rect.width > 0 && rect.height > 0 && computed.visibility !== "hidden",
        width: Math.round(rect.width),
        height: Math.round(rect.height),
        styles,
      } as const;
    },
    { selector, properties: [...MEASURED_PROPERTIES] },
  );
}

function primaryFontFamily(fontFamily: string): string {
  return (fontFamily.split(",")[0] ?? "").trim().replace(/^["']|["']$/g, "");
}

function hasNoBorder(styles: Record<string, string>): boolean {
  return (styles["border-width"] ?? "").split(" ").every((width) => width === "0px");
}

function usesGap(styles: Record<string, string>): boolean {
  return /flex|grid/.test(styles.display);
}

/** Properties whose value has no visible effect in either page, so a mismatch is noise. */
function isIrrelevant(property: string, mockup: Record<string, string>, app: Record<string, string>): boolean {
  if (property === "border-color" || property === "border-style") {
    return hasNoBorder(mockup) && hasNoBorder(app);
  }
  if (property === "gap") {
    return !usesGap(mockup) && !usesGap(app);
  }
  return false;
}

function compareStyles(label: string, mockup: Record<string, string>, app: Record<string, string>): Difference[] {
  const differences: Difference[] = [];

  for (const property of MEASURED_PROPERTIES) {
    const mockupValue = mockup[property] ?? "";
    const appValue = app[property] ?? "";
    const isSame =
      property === "font-family" ? primaryFontFamily(mockupValue) === primaryFontFamily(appValue) : mockupValue === appValue;

    if (!isSame && !isIrrelevant(property, mockup, app)) {
      differences.push({ element: label, property, mockup: mockupValue, app: appValue });
    }
  }

  return differences;
}

function comparePair(
  pair: ElementPair,
  mockup: Measurement | null,
  app: Measurement | null,
  errors: string[],
): Difference[] {
  if (mockup?.found === false) {
    errors.push(`Mockup selector not found for "${pair.label}": ${String(pair.mockup)}`);
  }
  if (app?.found === false) {
    errors.push(`App selector not found for "${pair.label}": ${String(pair.app)}`);
  }
  if (mockup?.found === false || app?.found === false) {
    return [];
  }

  if (app === null) {
    return mockup?.visible ? [{ element: pair.label, property: "presence", mockup: "shown", app: "not in app" }] : [];
  }
  if (mockup === null) {
    return app.visible ? [{ element: pair.label, property: "presence", mockup: "not in mockup", app: "shown" }] : [];
  }
  if (mockup.visible !== app.visible) {
    return [
      {
        element: pair.label,
        property: "visibility",
        mockup: mockup.visible ? "visible" : "hidden",
        app: app.visible ? "visible" : "hidden",
      },
    ];
  }
  if (!mockup.visible) {
    return [];
  }

  const differences = compareStyles(pair.label, mockup.styles, app.styles);
  if (Math.abs(mockup.width - app.width) > SIZE_TOLERANCE_PX || Math.abs(mockup.height - app.height) > SIZE_TOLERANCE_PX) {
    differences.push({
      element: pair.label,
      property: "size (w×h)",
      mockup: `${String(mockup.width)}×${String(mockup.height)}`,
      app: `${String(app.width)}×${String(app.height)}`,
    });
  }

  return differences;
}

async function openAppPage(browser: Browser, appOrigin: string, screen: ScreenDefinition, width: number, errors: string[]) {
  const page = await browser.newPage({ viewport: { width, height: VIEWPORT_HEIGHT } });
  watchForErrors(page, "app", errors);

  await page.route(`**${FAKE_API_BASE}/**`, async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const apiPath = url.pathname.slice(FAKE_API_BASE.length);
    const body = screen.fakeApi(request.method(), apiPath);

    if (body === undefined) {
      errors.push(`app: unfaked API request ${request.method()} ${apiPath}${url.search}; add it to screens.ts`);
      await route.fulfill({ status: 404, json: { detail: "Not faked by mockup-compare." } });
      return;
    }

    await route.fulfill({ status: 200, json: toWire(body) });
  });

  await page.goto(`${appOrigin}${screen.appPath}`);
  await page.locator(screen.appReadySelector).first().waitFor({ timeout: 15000 });
  await screen.prepareApp?.(page);
  await page.evaluate(() => document.fonts.ready);
  return page;
}

async function openMockupPage(browser: Browser, screen: ScreenDefinition, width: number, errors: string[]) {
  const page = await browser.newPage({ viewport: { width, height: VIEWPORT_HEIGHT } });
  watchForErrors(page, "mockup", errors);
  await page.goto(mockupUrl);
  await screen.prepareMockup?.(page);
  await page.evaluate(() => document.fonts.ready);
  return page;
}

function formatReport(screenName: string, screen: ScreenDefinition, sections: string[], errors: string[]): string {
  const lines = [`# Mockup comparison: ${screenName}`, "", screen.description, ""];

  if (errors.length > 0) {
    lines.push("## Errors (fix these before trusting the differences)", "", ...errors.map((error) => `- ${error}`), "");
  }

  lines.push(...sections);
  return lines.join("\n");
}

function escapeCell(value: string): string {
  return value.replace(/\|/g, "\\|") || "(empty)";
}

async function main(): Promise<number> {
  const { screenName, screen, widths } = parseCommandLine();
  const outputDirectory = path.join(outputRoot, screenName);
  await rm(outputDirectory, { recursive: true, force: true });

  process.env.VITE_API_BASE_URL = FAKE_API_BASE;
  const server = await createServer({
    root: frontendDirectory,
    logLevel: "error",
    server: { host: "127.0.0.1", port: 5190, strictPort: false },
  });
  await server.listen();
  const appOrigin = server.resolvedUrls?.local[0]?.replace(/\/$/, "");
  if (!appOrigin) {
    throw new Error("Vite dev server did not report a local URL.");
  }

  const browser = await chromium.launch();
  const errors: string[] = [];
  const sections: string[] = [];

  try {
    for (const width of widths) {
      const widthDirectory = path.join(outputDirectory, String(width));
      await mkdir(widthDirectory, { recursive: true });

      const appPage = await openAppPage(browser, appOrigin, screen, width, errors);
      const mockupPage = await openMockupPage(browser, screen, width, errors);
      await appPage.screenshot({ path: path.join(widthDirectory, "app.png"), fullPage: true });
      await mockupPage.screenshot({ path: path.join(widthDirectory, "mockup.png"), fullPage: true });

      const differences: Difference[] = [];
      for (const pair of screen.pairs) {
        const [mockupMeasurement, appMeasurement] = await Promise.all([
          measure(mockupPage, pair.mockup),
          measure(appPage, pair.app),
        ]);
        differences.push(...comparePair(pair, mockupMeasurement, appMeasurement, errors));
      }

      await appPage.close();
      await mockupPage.close();

      sections.push(
        `## ${String(width)} px`,
        "",
        `Screenshots: \`${path.relative(frontendDirectory, widthDirectory)}/app.png\`, \`mockup.png\``,
        "",
        differences.length === 0 ? "No measured differences." : "| Element | Property | Mockup | App |",
        ...(differences.length === 0 ? [] : ["|---|---|---|---|"]),
        ...differences.map(
          (difference) =>
            `| ${difference.element} | ${difference.property} | ${escapeCell(difference.mockup)} | ${escapeCell(difference.app)} |`,
        ),
        "",
      );
    }
  } finally {
    await browser.close();
    await server.close();
  }

  const uniqueErrors = [...new Set(errors)];
  const report = formatReport(screenName, screen, sections, uniqueErrors);
  const reportPath = path.join(outputDirectory, "report.md");
  await writeFile(reportPath, report);
  console.log(report);
  console.log(`Report written to ${path.relative(process.cwd(), reportPath)}`);

  return uniqueErrors.length > 0 ? 1 : 0;
}

main().then(
  (exitCode) => {
    process.exitCode = exitCode;
  },
  (error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  },
);
