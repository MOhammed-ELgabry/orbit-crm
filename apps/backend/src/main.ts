import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';

import { AppModule } from './modules/app/app.module';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { PrismaExceptionFilter } from './common/filters/prisma-exception.filter';
import { ResponseInterceptor } from './common/interceptors/response.interceptor';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Trust exactly one reverse-proxy hop (the Nginx instance in front of
  // this app in production — see deployment notes). Without this,
  // Express's default trust proxy=false means req.ip is always the raw
  // TCP peer address; behind a reverse proxy that is Nginx's own
  // address for every request, not the real client's, so
  // @nestjs/throttler's rate limiting (which tracks purely by req.ip —
  // see ThrottlerGuard.getTracker()) cannot tell clients apart at all
  // in that topology. Using the number 1, not `true`, is deliberate:
  // it trusts only the single nearest hop and derives req.ip from
  // that hop's own X-Forwarded-For value, so a client-supplied
  // X-Forwarded-For header is not, by itself, taken as truth — it
  // still passes through Nginx's own handling first.
  //
  // Safety of this setting depends on two things this process cannot
  // verify from source alone: (1) Nginx is configured to set/append
  // X-Forwarded-For with the real client IP (e.g.
  // `proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;`,
  // Nginx's own standard reverse-proxy pattern) rather than passing an
  // inbound client-supplied value through unmodified; (2) this NestJS
  // process is not itself directly reachable from the internet on its
  // listening port — only through Nginx. If either doesn't hold for
  // the actual deployment, this should be revisited.
  app.getHttpAdapter().getInstance().set('trust proxy', 1);

  const configService = app.get(ConfigService);
  const frontendUrl = configService.getOrThrow<string>('frontendUrl');

  // CORS Configuration — a single explicit origin, read from config, never
  // a wildcard and never a dynamic reflection of the request's Origin
  // header. This is safety-critical now that auth uses cookies: getting
  // this wrong (wildcard, or reflecting arbitrary Origin) would let any
  // site read authenticated responses via credentialed cross-origin
  // requests.
  app.enableCors({
    origin: frontendUrl,
    credentials: true,
  });

  app.use(cookieParser());

  // Security headers. contentSecurityPolicy and crossOriginOpenerPolicy
  // are deliberately disabled here rather than left on Helmet's defaults:
  // - Helmet's default CSP blocks inline <script>/<style>, which would
  //   break both the OAuth popup callback page (utils/social-callback-page.util.ts
  //   renders an inline script that does the window.opener.postMessage
  //   call this whole social-login flow depends on) and Swagger UI's
  //   bundled assets at /docs.
  // - Helmet's default Cross-Origin-Opener-Policy (same-origin) isolates
  //   the popup's browsing context group on navigation to this origin,
  //   which severs window.opener — silently breaking the same postMessage
  //   call (it would just never fire).
  // Enabling either safely is possible (a nonce-based CSP threaded through
  // social-callback-page.util.ts; a COOP value scoped to exclude the
  // callback route) but needs to be built and verified against a real
  // browser, which isn't possible in the environment this was written in
  // — see the audit report's "Remaining Risks" section.
  app.use(
    helmet({
      contentSecurityPolicy: false,
      crossOriginOpenerPolicy: false,
      crossOriginEmbedderPolicy: false,
    }),
  );

  // Global Exception Filters
  app.useGlobalFilters(new PrismaExceptionFilter(), new HttpExceptionFilter());

  // Global Response Interceptor
  app.useGlobalInterceptors(new ResponseInterceptor());

  // Global Validation
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  );

  // Swagger Configuration
  //
  // Only mounted outside production. Every route still independently
  // requires real authentication/authorization regardless of whether
  // this is enabled — Swagger never was the thing standing between an
  // attacker and the data — but publishing the full route/DTO/example
  // surface at a well-known path in a live deployment is free
  // reconnaissance for no product benefit, so it's kept dev/staging-only.
  if (!configService.get<boolean>('app.isProduction')) {
    const config = new DocumentBuilder()
      .setTitle('Orbit CRM API')
      .setDescription('Professional REST API documentation for Orbit CRM')
      .setVersion('1.0.0')
      .addBearerAuth(
        {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          description:
            'Optional when testing from a browser with session cookies set; ' +
            'paste an access token here to call endpoints without cookies ' +
            '(e.g. from outside the browser).',
        },
        'JWT',
      )
      .build();

    const document = SwaggerModule.createDocument(app, config, {
      deepScanRoutes: true,
    });

    SwaggerModule.setup('docs', app, document, {
      swaggerOptions: {
        persistAuthorization: true,
        displayRequestDuration: true,
        filter: true,
        docExpansion: 'none',
        tagsSorter: 'alpha',
        operationsSorter: 'alpha',
      },
    });
  }

  await app.listen(process.env.PORT ?? 3000);
}

bootstrap().catch((error) => {
  console.error(error);
});
