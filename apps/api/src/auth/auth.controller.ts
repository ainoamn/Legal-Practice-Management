import { openApiSchema } from "../openapi.js";
import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Req,
  Res,
  Param,
  UseGuards,
  Inject,
} from "@nestjs/common";
import { ApiTags, ApiCookieAuth, ApiBody } from "@nestjs/swagger";
import type { Response } from "express";
import {
  registerSchema,
  loginSchema,
  mfaSetupSchema,
  mfaConfirmSchema,
  mfaDisableSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
} from "../../../../packages/contracts/src/index.js";
import { AuthService } from "./auth.service.js";
import { MfaService } from "./mfa.service.js";
import { RecoveryService } from "./recovery.service.js";
import {
  COOKIE,
  parse,
  SessionGuard,
  RateLimitGuard,
  type AuthRequest,
} from "../security.js";
import { z } from "zod";

@ApiTags("Authentication")
@Controller("auth")
export class AuthController {
  constructor(
    @Inject(AuthService) private readonly auth: AuthService,
    @Inject(MfaService) private readonly mfa: MfaService,
    @Inject(RecoveryService) private readonly recovery: RecoveryService,
  ) {}
  @Get("capabilities") capabilities() {
    return this.recovery.capabilities();
  }
  @Post("password/forgot")
  @UseGuards(RateLimitGuard)
  @ApiBody({ schema: openApiSchema(forgotPasswordSchema) })
  forgot(@Body() body: unknown) {
    const input = parse(forgotPasswordSchema, body);
    return this.recovery.forgot(input.email, input.slug);
  }
  @Post("password/reset")
  @UseGuards(RateLimitGuard)
  @ApiBody({ schema: openApiSchema(resetPasswordSchema) })
  reset(@Body() body: unknown) {
    const input = parse(resetPasswordSchema, body);
    return this.recovery.reset(input.token, input.password);
  }
  @Get("mfa")
  @UseGuards(SessionGuard)
  @ApiCookieAuth()
  mfaStatus(@Req() req: AuthRequest) {
    return this.mfa.status(req.actor);
  }
  @Post("mfa/setup")
  @UseGuards(SessionGuard, RateLimitGuard)
  @ApiCookieAuth()
  @ApiBody({ schema: openApiSchema(mfaSetupSchema) })
  setupMfa(@Req() req: AuthRequest, @Body() body: unknown) {
    return this.mfa.setup(req.actor, parse(mfaSetupSchema, body).password);
  }
  @Post("mfa/confirm")
  @UseGuards(SessionGuard, RateLimitGuard)
  @ApiCookieAuth()
  @ApiBody({ schema: openApiSchema(mfaConfirmSchema) })
  confirmMfa(@Req() req: AuthRequest, @Body() body: unknown) {
    return this.mfa.confirm(req.actor, parse(mfaConfirmSchema, body).code);
  }
  @Post("mfa/disable")
  @UseGuards(SessionGuard, RateLimitGuard)
  @ApiCookieAuth()
  @ApiBody({ schema: openApiSchema(mfaDisableSchema) })
  disableMfa(@Req() req: AuthRequest, @Body() body: unknown) {
    const input = parse(mfaDisableSchema, body);
    return this.mfa.disable(req.actor, input.password, input.factor);
  }
  private cookie(res: Response, session: { token: string; expiresAt: Date }) {
    res.cookie(COOKIE, session.token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      expires: session.expiresAt,
    });
    return { ok: true };
  }
  @Post("register")
  @UseGuards(RateLimitGuard)
  @ApiBody({ schema: openApiSchema(registerSchema) })
  async register(
    @Body() body: unknown,
    @Req() req: AuthRequest,
    @Res({ passthrough: true }) res: Response,
  ) {
    return this.cookie(
      res,
      await this.auth.register(
        parse(registerSchema, body),
        req.headers["user-agent"] ?? "",
      ),
    );
  }
  @Post("login")
  @UseGuards(RateLimitGuard)
  @ApiBody({ schema: openApiSchema(loginSchema) })
  async login(
    @Body() body: unknown,
    @Req() req: AuthRequest,
    @Res({ passthrough: true }) res: Response,
  ) {
    return this.cookie(
      res,
      await this.auth.login(
        parse(loginSchema, body),
        req.headers["user-agent"] ?? "",
      ),
    );
  }
  @Get("me")
  @UseGuards(SessionGuard)
  @ApiCookieAuth()
  me(@Req() req: AuthRequest) {
    return this.auth.me(req.actor);
  }
  @Post("logout")
  @UseGuards(SessionGuard)
  @ApiCookieAuth()
  async logout(
    @Req() req: AuthRequest,
    @Res({ passthrough: true }) res: Response,
  ) {
    await this.auth.logout(req.actor);
    res.clearCookie(COOKIE, { path: "/" });
    return { ok: true };
  }
  @Get("sessions")
  @UseGuards(SessionGuard)
  @ApiCookieAuth()
  sessions(@Req() req: AuthRequest) {
    return this.auth.sessions(req.actor);
  }
  @Delete("sessions/:id")
  @UseGuards(SessionGuard)
  @ApiCookieAuth()
  revoke(@Param("id") id: string, @Req() req: AuthRequest) {
    return this.auth.revoke(req.actor, parse(z.uuid(), id));
  }
  @Post("revoke-others")
  @UseGuards(SessionGuard)
  @ApiCookieAuth()
  revokeOthers(@Req() req: AuthRequest) {
    return this.auth.revoke(req.actor);
  }
}
