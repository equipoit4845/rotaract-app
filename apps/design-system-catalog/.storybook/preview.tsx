import "@mirotaract/design-tokens/tokens.css";
import "@mirotaract/design-tokens/reset.css";
import "@mirotaract/ui/styles.css";
import "@mirotaract/admin-shell/styles.css";

import { mrThemeProps, type MrThemeName } from "@mirotaract/design-tokens";
import { ToastProvider, ToastViewport, TooltipProvider } from "@mirotaract/ui";
import type { Preview } from "@storybook/react";

const preview: Preview = {
  globalTypes: {
    theme: {
      description: "Mi Rotaract theme",
      defaultValue: "light",
      toolbar: {
        title: "Theme",
        icon: "mirror",
        items: [
          { value: "light", title: "Light" },
          { value: "dark", title: "Dark" },
        ],
        dynamicTitle: true,
      },
    },
  },
  decorators: [
    (Story, context) => {
      const theme = (context.globals.theme as MrThemeName) ?? "light";
      return (
        <div
          {...mrThemeProps(theme)}
          style={{
            minHeight: "100vh",
            padding: "1.5rem",
            background: "var(--mr-color-canvas)",
            color: "var(--mr-color-text)",
          }}
        >
          <TooltipProvider>
            <ToastProvider swipeDirection="right">
              <Story />
              <ToastViewport />
            </ToastProvider>
          </TooltipProvider>
        </div>
      );
    },
  ],
  parameters: {
    controls: { expanded: true },
    a11y: { test: "todo" },
  },
};

export default preview;
