/// Configuración pública de la app, con `--dart-define` / `--dart-define-from-file`.
///
/// Todo lo que va acá termina dentro del binario: **nunca** pongas secretos
/// (`MIROTARACT_CLIENT_SECRET`, `SESSION_SECRET`…). Esta app es un cliente
/// `PUBLIC`: se identifica solo con su `client_id` + PKCE.
class AppConfig {
  const AppConfig._();

  /// API del kernel = issuer OIDC (los endpoints se descubren desde
  /// `/.well-known/openid-configuration`).
  static const issuer = String.fromEnvironment(
    'MIROTARACT_ISSUER',
    defaultValue: 'https://api.rotaract4845.com/api/kernel/v1',
  );

  /// `client_id` de la app PUBLIC (móvil) registrada por el RDR.
  static const clientId = String.fromEnvironment('MIROTARACT_CLIENT_ID');

  /// Dirección de regreso registrada en la app (igualdad exacta). El kernel
  /// acepta `https://…` (App Links / Universal Links) o `http://localhost`.
  static const redirectUri = String.fromEnvironment('MIROTARACT_REDIRECT_URI');

  /// Tu backend (plantilla `next` o `fastapi`), que expone `GET /api/members`.
  static const backendUrl = String.fromEnvironment(
    'BACKEND_URL',
    defaultValue: 'http://localhost:3000',
  );

  /// Pedí solo lo que usás.
  static const scopes = ['openid', 'profile', 'memberships'];

  static List<String> missing() => [
        if (clientId.isEmpty) 'MIROTARACT_CLIENT_ID',
        if (redirectUri.isEmpty) 'MIROTARACT_REDIRECT_URI',
      ];
}
