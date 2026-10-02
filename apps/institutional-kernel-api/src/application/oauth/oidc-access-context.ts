/**
 * Links the `scopes` array that OidcAccessGuard puts on `request.oidc` to
 * the app the access token was issued to.
 *
 * OAuthController.getOAuthUserInfo hands OidcService.userInfo only
 * `{ personId, scopes }` (the same array instance the guard created), but
 * the claims must be restricted to the app's organization tree, so the
 * service needs the app. Keyed weakly by that array: nothing outlives the
 * request.
 */
const appByScopes = new WeakMap<string[], string>();

export function bindAccessApp(scopes: string[], appId: string): void {
  appByScopes.set(scopes, appId);
}

export function boundAccessApp(scopes: string[]): string | undefined {
  return appByScopes.get(scopes);
}
