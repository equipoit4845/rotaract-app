import { expect, test } from "@playwright/test";

import { gotoStory } from "./story";

// Mobile-viewport baselines for the admin patterns most likely to break on
// narrow screens (§26). Light theme only — the light/dark axis is already
// covered at desktop size in components.spec.ts.
test.use({ viewport: { width: 390, height: 844 } });

const ADMIN_MOBILE: { name: string; storyId: string }[] = [
  { name: "admin-frame", storyId: "admin-shell-adminframe--default" },
  { name: "page-header", storyId: "admin-shell-pageheader--default" },
  { name: "data-toolbar", storyId: "admin-shell-datatoolbar--default" },
  { name: "table", storyId: "ui-table--default" },
  {
    name: "organization-switcher",
    storyId: "admin-shell-organizationswitcher--default",
  },
  { name: "module-frame", storyId: "admin-shell-moduleframe--default" },
];

for (const { name, storyId } of ADMIN_MOBILE) {
  test(`${name} — mobile`, async ({ page }) => {
    const root = await gotoStory(page, storyId, "light");
    await expect(root).toHaveScreenshot(`${name}-mobile.png`);
  });
}
