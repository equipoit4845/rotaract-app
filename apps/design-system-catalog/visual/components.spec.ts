import { expect, test } from "@playwright/test";

import { gotoStory } from "./story";

// Curated, not exhaustive — one light+dark baseline per component family,
// desktop viewport. See docs/08-design-system.md's visual regression
// policy for what widening this matrix requires.
const COMPONENTS: { name: string; storyId: string }[] = [
  { name: "button", storyId: "ui-button--primary" },
  { name: "badge", storyId: "ui-badge--all-tones" },
  { name: "card", storyId: "ui-card--default" },
  { name: "form-field-input", storyId: "ui-formfield--text-input" },
  { name: "table", storyId: "ui-table--default" },
  { name: "page-header", storyId: "admin-shell-pageheader--default" },
  { name: "stat-card", storyId: "admin-shell-statcard--tones" },
  {
    name: "organization-switcher",
    storyId: "admin-shell-organizationswitcher--default",
  },
  { name: "admin-frame", storyId: "admin-shell-adminframe--default" },
  { name: "module-frame", storyId: "admin-shell-moduleframe--default" },
];

for (const { name, storyId } of COMPONENTS) {
  for (const theme of ["light", "dark"] as const) {
    test(`${name} — ${theme}`, async ({ page }) => {
      const root = await gotoStory(page, storyId, theme);
      await expect(root).toHaveScreenshot(`${name}-${theme}.png`);
    });
  }
}

// Dialog renders through a Radix Portal, outside #storybook-root — scope
// to the dialog surface itself (by role), not the (portal-missing) root.
for (const theme of ["light", "dark"] as const) {
  test(`dialog (open) — ${theme}`, async ({ page }) => {
    await gotoStory(page, "ui-dialog--default", theme);
    await page.getByRole("button", { name: /dar de baja membresía/i }).click();
    const dialog = page.getByRole("dialog");
    await dialog.waitFor({ state: "visible" });
    await page.waitForTimeout(150);
    await expect(dialog).toHaveScreenshot(`dialog-open-${theme}.png`);
  });
}
