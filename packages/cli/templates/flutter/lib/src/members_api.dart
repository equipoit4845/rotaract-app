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
