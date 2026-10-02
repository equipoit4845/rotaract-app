import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { IoAdapter } from '@nestjs/platform-socket.io';
import { AppModule } from './app.module';
import { meetingsTokenSecret } from './auth/meetings-token';

export const GLOBAL_PREFIX = 'meetings-api';

export async function createApp() {
  const app = await NestFactory.create(AppModule);
  app.setGlobalPrefix(GLOBAL_PREFIX);
  app.useWebSocketAdapter(new IoAdapter(app));
  app.useGlobalPipes(new ValidationPipe({ whitelist: true }));
  // Production is same-origin (cloudflared path ingress); CORS only matters in dev.
  const allowedOrigins = (process.env.MEETINGS_CORS_ORIGIN ?? 'http://localhost:3002')
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
  meetingsTokenSecret();
  const app = await createApp();
  const port = Number(process.env.PORT ?? 3003);
  await app.listen(port, process.env.HOST ?? '0.0.0.0');
  console.log(`meetings-api listening on http://localhost:${port}/${GLOBAL_PREFIX}`);
}

if (require.main === module) {
  void bootstrap();
}
