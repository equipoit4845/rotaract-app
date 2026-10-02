import { Global, Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { AuthController } from './auth.controller';
import { JwtStrategy } from './jwt.strategy';
import { MEETINGS_TOKEN_ALGORITHM, MEETINGS_TOKEN_AUDIENCE, MEETINGS_TOKEN_ISSUER, meetingsTokenSecret } from './meetings-token';

@Global()
@Module({
  imports: [
    PassportModule,
    JwtModule.registerAsync({
      useFactory: () => ({
        secret: meetingsTokenSecret(),
        verifyOptions: {
          algorithms: [MEETINGS_TOKEN_ALGORITHM],
          audience: MEETINGS_TOKEN_AUDIENCE,
          issuer: MEETINGS_TOKEN_ISSUER,
        },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [JwtStrategy],
  exports: [JwtModule, PassportModule],
})
export class AuthModule {}
