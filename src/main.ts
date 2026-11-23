import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { PlatformLogger } from './platform';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  app.useLogger(app.get(PlatformLogger));
  app.enableShutdownHooks();
  await app.listen(process.env.PORT ?? 3000);
}
void bootstrap();
