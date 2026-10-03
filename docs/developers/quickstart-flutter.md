# Quickstart: Flutter

En 15 minutos: una app Flutter donde la gente entra con su cuenta de Mi
Rotaract (authorization code + PKCE en el navegador del sistema) y ve el
padrón de su club a través de **tu** backend. El código de esta página es el
de la plantilla `mirotaract init --template flutter`; CI comprueba que esté
igual a la plantilla (`pnpm quickstarts:check`).

**Vas a necesitar:** Flutter 3.22+, Docker, la CLI `mirotaract` (ver
[cli.md](cli.md#0-requisitos-una-vez)) y un backend con `GET /api/members`:
las plantillas `next` ([quickstart](quickstart-nextjs.md)) y `fastapi`
([quickstart](quickstart-fastapi.md)) ya lo traen.

> **Por qué un backend.** La API de datos exige un token de servicio, que
> necesita un secreto, y una app móvil no puede guardar secretos. La app es
> `PUBLIC`: se identifica con su `client_id` + PKCE y le manda a tu backend el
> access token de la persona.

## 1. Crear el proyecto

```bash
mirotaract init padron_app --template flutter
cd padron_app && flutter pub get
mirotaract dev up --kernel-repo ~/rotaract-app   # si no lo levantaste con el backend
```

`dev up` registra una app `PUBLIC` de prueba con la dirección de regreso
`http://localhost:8765/callback` y deja su `client_id` en
`MIROTARACT_PUBLIC_CLIENT_ID` de `.env.local`. Copiá
`dart_defines.example.json` a `dart_defines.json` y completalo con ese valor.

## 2. Configuración pública

Todo lo que va acá termina dentro del binario: nunca pongas secretos.

```dart file=lib/src/config.dart from=packages/cli/templates/flutter/lib/src/config.dart
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
```

## 3. Ingresar con Mi Rotaract

El access token (10 minutos) vive solo en memoria; el refresh token, en el
almacenamiento seguro del sistema (Keychain / Keystore).

```dart file=lib/src/auth_service.dart from=packages/cli/templates/flutter/lib/src/auth_service.dart
import 'dart:convert';

import 'package:flutter_appauth/flutter_appauth.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';

import 'config.dart';

/// Persona que ingresó (claims del id_token que verificó AppAuth).
class MiRotaractUser {
  const MiRotaractUser({required this.sub, this.name, this.givenName});

  final String sub;
  final String? name;
  final String? givenName;
}

/// "Ingresar con Mi Rotaract": authorization code + PKCE (S256), `state` y
/// `nonce`, en el navegador del sistema (nunca un WebView embebido).
///
/// - El access token (10 min) vive **solo en memoria**.
/// - El refresh token va al almacenamiento seguro del sistema.
/// - No hay secretos: la app es `PUBLIC`.
class AuthService {
  AuthService({FlutterAppAuth? appAuth, FlutterSecureStorage? storage})
      : _appAuth = appAuth ?? const FlutterAppAuth(),
        _storage = storage ?? const FlutterSecureStorage();

  static const _refreshKey = 'mirotaract_refresh_token';

  final FlutterAppAuth _appAuth;
  final FlutterSecureStorage _storage;

  String? _accessToken;
  DateTime? _expiresAt;
  MiRotaractUser? user;

  bool get isSignedIn => user != null;

  Future<MiRotaractUser> signIn() async {
    final result = await _appAuth.authorizeAndExchangeCode(
      AuthorizationTokenRequest(
        AppConfig.clientId,
        AppConfig.redirectUri,
        issuer: AppConfig.issuer,
        scopes: AppConfig.scopes,
        // PKCE S256, state y nonce los genera y valida AppAuth.
        allowInsecureConnections: AppConfig.issuer.startsWith('http://localhost'),
      ),
    );
    return _store(result.accessToken, result.accessTokenExpirationDateTime, result.refreshToken, result.idToken);
  }

  /// Renueva la sesión con el refresh token guardado (si la app tiene el grant).
  Future<MiRotaractUser?> restore() async {
    final refreshToken = await _storage.read(key: _refreshKey);
    if (refreshToken == null) return null;
    try {
      final result = await _appAuth.token(
        TokenRequest(
          AppConfig.clientId,
          AppConfig.redirectUri,
          issuer: AppConfig.issuer,
          refreshToken: refreshToken,
          scopes: AppConfig.scopes,
          allowInsecureConnections: AppConfig.issuer.startsWith('http://localhost'),
        ),
      );
      return _store(result.accessToken, result.accessTokenExpirationDateTime, result.refreshToken, result.idToken);
    } on Exception {
      // Refresh vencido, reusado o acceso quitado: hay que ingresar de nuevo.
      await signOut();
      return null;
    }
  }

  /// Access token vigente (renueva si faltan menos de 30 s).
  Future<String?> accessToken() async {
    final expiresAt = _expiresAt;
    if (_accessToken != null && expiresAt != null && expiresAt.isAfter(DateTime.now().add(const Duration(seconds: 30)))) {
      return _accessToken;
    }
    return (await restore()) == null ? null : _accessToken;
  }

  Future<void> signOut() async {
    _accessToken = null;
    _expiresAt = null;
    user = null;
    await _storage.delete(key: _refreshKey);
  }

  Future<MiRotaractUser> _store(String? accessToken, DateTime? expiresAt, String? refreshToken, String? idToken) async {
    if (accessToken == null || idToken == null) {
      throw StateError('Mi Rotaract no devolvió los tokens esperados');
    }
    _accessToken = accessToken;
    _expiresAt = expiresAt ?? DateTime.now().add(const Duration(minutes: 10));
    if (refreshToken != null) {
      // El refresh token rota en cada uso: siempre guardá el último.
      await _storage.write(key: _refreshKey, value: refreshToken);
    }
    // AppAuth valida iss, aud, exp y nonce del id_token, que llegó directo del
    // token endpoint por TLS (OIDC Core §3.1.3.7). Acá solo leemos claims para
    // mostrar el nombre: la autorización la decide tu backend, que verifica el
    // access token contra el JWKS en cada pedido.
    final claims = _claims(idToken);
    return user = MiRotaractUser(
      sub: claims['sub'] as String,
      name: claims['name'] as String?,
      givenName: claims['given_name'] as String?,
    );
  }

  static Map<String, dynamic> _claims(String jwt) {
    final parts = jwt.split('.');
    if (parts.length != 3) throw const FormatException('id_token inválido');
    return jsonDecode(utf8.decode(base64Url.decode(base64Url.normalize(parts[1])))) as Map<String, dynamic>;
  }
}
```

## 4. Leer el padrón desde tu backend

```dart file=lib/src/members_api.dart from=packages/cli/templates/flutter/lib/src/members_api.dart
import 'dart:convert';

import 'package:http/http.dart' as http;

import 'config.dart';

class ClubMember {
  const ClubMember({required this.displayName, required this.status, this.memberNumber});

  final String displayName;
  final String status;
  final String? memberNumber;
}

class ClubRoster {
  const ClubRoster({required this.name, required this.members});

  final String name;
  final List<ClubMember> members;
}

class MembersApiException implements Exception {
  const MembersApiException(this.message, {this.unauthorized = false});

  final String message;
  final bool unauthorized;

  @override
  String toString() => message;
}

/// El padrón NO se lee directo de la API de datos: esa API exige un token de
/// servicio (client_credentials), que necesita un secreto, y una app móvil no
/// puede guardar secretos. La app llama a TU backend (plantillas `next` o
/// `fastapi`, `GET /api/members`) con el access token de la persona; el
/// backend lo verifica y consulta al kernel con sus propias credenciales.
class MembersApi {
  MembersApi({http.Client? client}) : _client = client ?? http.Client();

  final http.Client _client;

  Future<List<ClubRoster>> myClubs(String accessToken) async {
    final response = await _client.get(
      Uri.parse('${AppConfig.backendUrl}/api/members'),
      headers: {'Authorization': 'Bearer $accessToken', 'Accept': 'application/json'},
    );
    if (response.statusCode == 401) {
      throw const MembersApiException('Tu sesión venció. Ingresá de nuevo.', unauthorized: true);
    }
    if (response.statusCode != 200) {
      throw MembersApiException('No pudimos leer el padrón (HTTP ${response.statusCode}).');
    }
    final body = jsonDecode(utf8.decode(response.bodyBytes)) as Map<String, dynamic>;
    return [
      for (final club in (body['clubs'] as List<dynamic>).cast<Map<String, dynamic>>())
        ClubRoster(
          name: club['name'] as String,
          members: [
            for (final m in (club['members'] as List<dynamic>).cast<Map<String, dynamic>>())
              ClubMember(
                displayName: m['displayName'] as String,
                status: m['status'] as String,
                memberNumber: m['memberNumber'] as String?,
              ),
          ],
        ),
    ];
  }
}
```

## 5. Probar

```bash
flutter run --dart-define-from-file=dart_defines.json
```

Ingresá con `socio.norte@example.org` / `sandbox-9999`. La app llama a
`BACKEND_URL/api/members` con el access token; el backend lo verifica contra
el JWKS y `/oauth/userinfo` y lee el padrón con sus propias credenciales.

## 6. Antes de producción

- Pedile al RDR una app `PUBLIC` con una dirección de regreso `https://…`
  (App Links / Universal Links).
- Nunca guardes el refresh token en `SharedPreferences`.
- Revisá la [checklist de seguridad](seguridad.md).
