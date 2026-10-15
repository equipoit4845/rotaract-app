import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { correoTokenSecret } from './auth/correo-token';

export const GLOBAL_PREFIX = 'correo-api';

export async function createApp() {
  // rawBody: webhook signatures (kernel and ClickMail) are checked over the
  // exact bytes received.
  const app = await NestFactory.create(AppModule, { rawBody: true });
  app.setGlobalPrefix(GLOBAL_PREFIX);
  app.useGlobalPipes(new ValidationPipe({ whitelist: true }));
  // Production is same-origin (cloudflared path ingress); CORS only matters in dev.
  const allowedOrigins = (process.env.CORREO_CORS_ORIGIN ?? 'http://localhost:3005')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);
  app.enableCors({
    origin: (origin, callback) => {
      if (!origin) return callback(null, true);
      if (allowedOrigins.includes(origin)) return callback(null, true);
      return callback(null, false);
    },
    credentials: true,
  });
  app.enableShutdownHooks();
  return app;
}

async function bootstrap() {
  // Fail fast in production without a proper shared secret.
  correoTokenSecret();
  const app = await createApp();
  const port = Number(process.env.PORT ?? 3006);
  await app.listen(port, process.env.HOST ?? '0.0.0.0');
  console.log(`correo-api listening on http://localhost:${port}/${GLOBAL_PREFIX}`);
}

if (require.main === module) {
  void bootstrap();
}
