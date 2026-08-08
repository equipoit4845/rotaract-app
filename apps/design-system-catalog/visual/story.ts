import type { Locator, Page } from "@playwright/test";

/**
 * Returns a locator scoped to the story's own rendered root — not
 * `#storybook-root`, which is *also* full-viewport (the global decorator
 * in .storybook/preview.tsx sets `minHeight: "100vh"` on its theme
 * wrapper for nicer manual browsing). A full-page-sized screenshot lets a
 * real regression in a small component (e.g. a button's background color)
 * shrink to well under `maxDiffPixelRatio` just because it's a tiny
 * fraction of the captured area — confirmed twice while setting this up:
 * once against a raw full-page screenshot, once again against
 * `#storybook-root` itself, before finding the actual fix here.
 */
export async function gotoStory(
  page: Page,
  storyId: string,
  theme: "light" | "dark" = "light",
): Promise<Locator> {
  await page.goto(
    `/iframe.html?id=${storyId}&viewMode=story&globals=theme:${theme}`,
    {
      waitUntil: "networkidle",
    },
  );
  // Radix animations, skeleton pulse, spinner spin — settle before capture.
  await page.waitForTimeout(150);
  return page.locator(".mr-theme").locator(":scope > *").first();
}
