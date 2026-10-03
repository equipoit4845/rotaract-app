import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { DirectoryService } from '../directory/directory.service';
import {
  MEETINGS_TOKEN_ALGORITHM,
  MEETINGS_TOKEN_AUDIENCE,
  MEETINGS_TOKEN_ISSUER,
  MeetingsTokenPayload,
  meetingsTokenSecret,
} from './meetings-token';

/**
 * Registered as the 'jwt' passport strategy so every ported legacy
 * controller keeps its `@UseGuards(AuthGuard('jwt'))` unchanged.
 */
@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(private readonly directory: DirectoryService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: meetingsTokenSecret(),
      algorithms: [MEETINGS_TOKEN_ALGORITHM],
      audience: MEETINGS_TOKEN_AUDIENCE,
      issuer: MEETINGS_TOKEN_ISSUER,
    });
  }

  async validate(payload: MeetingsTokenPayload) {
    if (!payload?.sub) throw new UnauthorizedException();
    const user = await this.directory.resolveUser(payload.sub, { name: payload.name, email: payload.email });
    // Inactive persons are rejected, like legacy findById (isActive: false).
    if (!user || !user.isActive) throw new UnauthorizedException();
    return { id: user.id, email: user.email, role: user.role, fullName: user.fullName };
  }
}
