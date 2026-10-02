/**
 * Leaves Mi Rotaract for the app's `redirectTo` (a full-page navigation to
 * another origin, which the App Router can't do). Kept as a mutable object
 * so runtime tests can observe the destination instead of navigating jsdom.
 */
export const externalNavigation = {
  assign(url: string): void {
    window.location.assign(url);
  },
};
