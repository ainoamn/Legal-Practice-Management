import "dotenv/config";
import "reflect-metadata";
import {
  Controller,
  Get,
  Module,
  Global,
  ServiceUnavailableException,
  type DynamicModule,
} from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import type { NestExpressApplication } from "@nestjs/platform-express";
import { SwaggerModule, DocumentBuilder, ApiTags } from "@nestjs/swagger";
import helmetModule from "helmet";
import type { NextFunction, Request, RequestHandler, Response } from "express";
import cookieParser from "cookie-parser";
import {
  db,
  assertSafeDatabase,
  assertSafePlatformDatabase,
} from "../../../packages/database/src/index.js";
import { AuthController } from "./auth/auth.controller.js";
import { AuthService } from "./auth/auth.service.js";
import { BhdController } from "./auth/bhd.controller.js";
import { BhdService } from "./auth/bhd.service.js";
import { MfaService } from "./auth/mfa.service.js";
import { Mailer, ResendMailer } from "./auth/mail.js";
import { RecoveryService } from "./auth/recovery.service.js";
import { WorkspaceController } from "./workspace/workspace.controller.js";
import { WorkspaceService } from "./workspace/workspace.service.js";
import { PracticeController } from "./practice/practice.controller.js";
import { PracticeService } from "./practice/practice.service.js";
import { FinanceController } from "./finance/finance.controller.js";
import { FinanceService } from "./finance/finance.service.js";
import { PortalController } from "./portal/portal.controller.js";
import { PortalService } from "./portal/portal.service.js";
import { InstrumentsController } from "./instruments/instruments.controller.js";
import { InstrumentsService } from "./instruments/instruments.service.js";
import { DocumentsController } from "./documents/documents.controller.js";
import { DocumentsService } from "./documents/documents.service.js";
import { DocumentStorage, S3DocumentStorage } from "./documents/storage.js";
import { DocumentTools, LocalDocumentTools } from "./documents/tools.js";
import {
  DocumentJobs,
  DOCUMENT_WORKER_ENABLED,
} from "./documents/document-jobs.js";
import {
  PlatformAuthController,
  PlatformController,
  PublishedController,
} from "./platform/platform.controller.js";
import { PlatformAuthService } from "./platform/platform-auth.service.js";
import { PlatformService } from "./platform/platform.service.js";
import { PlatformGuard } from "./platform/platform.security.js";
import {
  Errors,
  SessionGuard,
  RateLimitGuard,
  securityMiddleware,
  bodyParserErrors,
  redis,
} from "./security.js";
@ApiTags("Public")
@Controller()
class PublicController {
  @Get("health") async health() {
    try {
      await db.$queryRaw`SELECT 1`;
      if (process.env.REDIS_URL) await redis.ping();
      return { status: "ok" };
    } catch {
      throw new ServiceUnavailableException("DEPENDENCY_UNAVAILABLE");
    }
  }
  @Get("countries") countries() {
    return db.country.findMany({
      where: { enabled: true },
      orderBy: { code: "asc" },
    });
  }
}
@Global()
@Module({
  controllers: [AuthController, BhdController],
  exports: [AuthService, BhdService],
  providers: [
    AuthService,
    BhdService,
    MfaService,
    RecoveryService,
    SessionGuard,
    RateLimitGuard,
  ],
})
class AuthModule {
  static configure(mailer: Mailer): DynamicModule {
    return {
      module: AuthModule,
      providers: [{ provide: Mailer, useValue: mailer }],
    };
  }
}
@Module({})
class WorkspaceModule {
  static configure(
    options: {
      storage?: DocumentStorage;
      tools?: DocumentTools;
      worker?: boolean;
    } = {},
  ): DynamicModule {
    return {
      module: WorkspaceModule,
      controllers: [
        WorkspaceController,
        PracticeController,
        DocumentsController,
        FinanceController,
        PortalController,
        InstrumentsController,
      ],
      providers: [
        WorkspaceService,
        PracticeService,
        DocumentsService,
        FinanceService,
        PortalService,
        InstrumentsService,
        DocumentJobs,
        SessionGuard,
        {
          provide: DocumentStorage,
          useValue: options.storage ?? new S3DocumentStorage(),
        },
        {
          provide: DocumentTools,
          useValue: options.tools ?? new LocalDocumentTools(),
        },
        { provide: DOCUMENT_WORKER_ENABLED, useValue: options.worker ?? true },
      ],
    };
  }
}
@Module({
  controllers: [
    PlatformAuthController,
    PlatformController,
    PublishedController,
  ],
  providers: [
    PlatformAuthService,
    PlatformService,
    PlatformGuard,
    RateLimitGuard,
  ],
})
class PlatformModule {}
@Module({})
class AppModule {}
export async function createApp(
  options: {
    mailer?: Mailer;
    documents?: {
      storage?: DocumentStorage;
      tools?: DocumentTools;
      worker?: boolean;
    };
  } = {},
) {
  if (
    !process.env.WEB_ORIGIN ||
    (!process.env.REDIS_URL && process.env.RATE_LIMIT_STORE !== "postgres")
  )
    throw new Error("WEB_ORIGIN and REDIS_URL required");
  const hours = Number(process.env.SESSION_HOURS ?? 12);
  if (!Number.isFinite(hours) || hours < 1 || hours > 168)
    throw new Error("SESSION_HOURS must be 1–168");
  await assertSafeDatabase();
  if (process.env.PLATFORM_DATABASE_URL) await assertSafePlatformDatabase();
  if (process.env.REDIS_URL && redis.status === "wait") await redis.connect();
  const app = await NestFactory.create<NestExpressApplication>(
    {
      module: AppModule,
      imports: [
        AuthModule.configure(options.mailer ?? new ResendMailer()),
        WorkspaceModule.configure(options.documents),
        PlatformModule,
      ],
      controllers: [PublicController],
    },
    {
      logger: ["error", "warn"],
      bodyParser: false,
    },
  );
  app.setGlobalPrefix("api/v1");
  const imported = helmetModule as unknown as {
    default?: () => RequestHandler;
  };
  const secureHeaders =
    typeof imported.default === "function"
      ? imported.default
      : (helmetModule as unknown as () => RequestHandler);
  app.use(secureHeaders());
  app.use(cookieParser());
  app.use(securityMiddleware);
  app.useBodyParser("json", { limit: "1mb" });
  app.use(bodyParserErrors);
  app.useGlobalFilters(new Errors());
  if (process.env.NODE_ENV !== "production")
    SwaggerModule.setup(
      "api/docs",
      app,
      SwaggerModule.createDocument(
        app,
        new DocumentBuilder()
          .setTitle("LEGAL OFFICE AI")
          .setVersion("1")
          .addCookieAuth("legal_session")
          .addCookieAuth(
            "legal_platform_session",
            { type: "apiKey", in: "cookie", name: "legal_platform_session" },
            "platformCookie",
          )
          .build(),
      ),
    );
  app.enableShutdownHooks();
  await app.init();
  return app;
}
let vercelApp: Promise<RequestHandler> | undefined;
export default function vercelHandler(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  vercelApp ??= createApp({
    documents: { worker: process.env.VERCEL !== "1" },
  }).then((app) => app.getHttpAdapter().getInstance() as RequestHandler);
  return vercelApp.then((handler) => handler(req, res, next));
}
