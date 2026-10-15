import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import type { CurrentUserPayload } from './current-user.decorator';
import {
  CORREO_TOKEN_ALGORITHM,
  CORREO_TOKEN_AUDIENCE,
  CORREO_TOKEN_ISSUER,
  CorreoTokenPayload,
  correoTokenSecret,
} from './correo-token';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor() {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: correoTokenSecret(),
      algorithms: [CORREO_TOKEN_ALGORITHM],
      audience: CORREO_TOKEN_AUDIENCE,
      issuer: CORREO_TOKEN_ISSUER,
    });
  }

  validate(payload: CorreoTokenPayload): CurrentUserPayload {
    if (!payload?.sub) throw new UnauthorizedException();
    return { personId: payload.sub, name: payload.name ?? null };
  }
}
