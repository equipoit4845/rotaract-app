import type { TestRunnerConfig } from "@storybook/test-runner";
import { checkA11y, configureAxe, injectAxe } from "axe-playwright";

// Foundations/Tokens is a raw color-swatch grid for reference, not a
// component — it has no interactive/semantic structure to check.
const SKIP_A11Y_TITLE_PREFIXES = ["Foundations"];

const config: TestRunnerConfig = {
  async preVisit(page) {
    await injectAxe(page);
  },
  async postVisit(page, context) {
    if (
      SKIP_A11Y_TITLE_PREFIXES.some((prefix) =>
        context.title.startsWith(prefix),
      )
    ) {
      return;
    }
    await configureAxe(page, {
      rules: [
        // Radix portals render outside #storybook-root; landmark-rule
        // noise from Storybook's own docs chrome isn't a component defect.
        { id: "region", enabled: false },
      ],
    });
    await checkA11y(page, "#storybook-root", {
      detailedReport: true,
      detailedReportOptions: { html: true },
      axeOptions: {
        runOnly: {
          type: "tag",
          values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"],
        },
      },
    });
  },
};

export default config;
