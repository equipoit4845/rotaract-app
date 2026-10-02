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
