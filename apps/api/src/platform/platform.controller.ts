import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  Query,
  Req,
  Res,
  UseGuards,
  Inject,
  NotFoundException,
} from "@nestjs/common";
import { ApiTags, ApiCookieAuth, ApiBody } from "@nestjs/swagger";
import type { Response } from "express";
import { z } from "zod";
import {
  adminLoginSchema,
  adminSetupSchema,
  adminConfirmSchema,
  adminCreateSchema,
  adminPatchSchema,
  planSchema,
  subscriptionSchema,
  invoiceSchema,
  paymentSchema,
  sitePageSchema,
  settingsSchema,
  countrySchema,
  platformPermissions,
} from "../../../../packages/contracts/src/platform.js";
import { parse, RateLimitGuard } from "../security.js";
import { openApiSchema } from "../openapi.js";
import { PlatformAuthService } from "./platform-auth.service.js";
import { PlatformService } from "./platform.service.js";
import {
  PlatformGuard,
  ADMIN_COOKIE,
  type AdminRequest,
} from "./platform.security.js";
import { db } from "../../../../packages/database/src/index.js";
import { registerSchema } from "../../../../packages/contracts/src/index.js";
@ApiTags("Platform authentication")
@Controller("platform/auth")
export class PlatformAuthController {
  constructor(
    @Inject(PlatformAuthService) private readonly auth: PlatformAuthService,
  ) {}
  @Post("login")
  @UseGuards(RateLimitGuard)
  @ApiBody({ schema: openApiSchema(adminLoginSchema) })
  async login(
    @Body() body: unknown,
    @Res({ passthrough: true }) res: Response,
  ) {
    const input = parse(adminLoginSchema, body),
      session = await this.auth.login(
        input.email,
        input.password,
        input.factor,
      );
    res.cookie(ADMIN_COOKIE, session.token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      path: "/api/v1/platform",
      expires: session.expiresAt,
    });
    return { ok: true };
  }
  @Get("me")
  @UseGuards(PlatformGuard)
  @ApiCookieAuth("platformCookie")
  me(@Req() req: AdminRequest) {
    return this.auth.me(req.adminActor);
  }
  @Post("logout")
  @UseGuards(PlatformGuard)
  @ApiCookieAuth("platformCookie")
  async logout(
    @Req() req: AdminRequest,
    @Res({ passthrough: true }) res: Response,
  ) {
    await this.auth.logout(req.adminActor);
    res.clearCookie(ADMIN_COOKIE, { path: "/api/v1/platform" });
    return { ok: true };
  }
  @Post("mfa/setup")
  @UseGuards(PlatformGuard, RateLimitGuard)
  @ApiCookieAuth("platformCookie")
  @ApiBody({ schema: openApiSchema(adminSetupSchema) })
  setup(@Req() req: AdminRequest, @Body() body: unknown) {
    return this.auth.setup(
      req.adminActor,
      parse(adminSetupSchema, body).password,
    );
  }
  @Post("revoke-others")
  @UseGuards(PlatformGuard)
  @ApiCookieAuth("platformCookie")
  revokeOthers(@Req() req: AdminRequest) {
    return this.auth.revokeOthers(req.adminActor);
  }
  @Post("mfa/confirm")
  @UseGuards(PlatformGuard, RateLimitGuard)
  @ApiCookieAuth("platformCookie")
  @ApiBody({ schema: openApiSchema(adminConfirmSchema) })
  confirm(@Req() req: AdminRequest, @Body() body: unknown) {
    return this.auth.confirm(
      req.adminActor,
      parse(adminConfirmSchema, body).code,
    );
  }
}
@ApiTags("Platform administration")
@ApiCookieAuth("platformCookie")
@UseGuards(PlatformGuard)
@Controller("platform")
export class PlatformController {
  constructor(
    @Inject(PlatformService) private readonly service: PlatformService,
  ) {}
  @Get("overview") overview(@Req() r: AdminRequest) {
    return this.service.overview(r.adminActor);
  }
  @Get("tenants") tenants(@Req() r: AdminRequest, @Query() q: unknown) {
    return this.service.tenants(r.adminActor, q);
  }
  @Post("tenants")
  @ApiBody({ schema: openApiSchema(registerSchema) })
  createTenant(@Req() r: AdminRequest, @Body() b: unknown) {
    return this.service.createTenant(r.adminActor, parse(registerSchema, b));
  }
  @Patch("tenants/:id/access")
  @ApiBody({
    schema: openApiSchema(
      z.strictObject({ status: z.enum(["ACTIVE", "READ_ONLY"]) }),
    ),
  })
  access(@Req() r: AdminRequest, @Param("id") id: string, @Body() b: unknown) {
    return this.service.tenantAccess(
      r.adminActor,
      parse(z.uuid(), id),
      parse(z.strictObject({ status: z.enum(["ACTIVE", "READ_ONLY"]) }), b)
        .status,
    );
  }
  @Get("users") users(@Req() r: AdminRequest, @Query() q: unknown) {
    return this.service.users(r.adminActor, q);
  }
  @Patch("users/:id")
  @ApiBody({ schema: openApiSchema(z.strictObject({ enabled: z.boolean() })) })
  user(@Req() r: AdminRequest, @Param("id") id: string, @Body() b: unknown) {
    return this.service.userEnabled(
      r.adminActor,
      parse(z.uuid(), id),
      parse(z.strictObject({ enabled: z.boolean() }), b).enabled,
    );
  }
  @Get("plans") plans(@Req() r: AdminRequest, @Query() q: unknown) {
    return this.service.plans(r.adminActor, q);
  }
  @Post("plans")
  @ApiBody({ schema: openApiSchema(planSchema) })
  addPlan(@Req() r: AdminRequest, @Body() b: unknown) {
    return this.service.savePlan(r.adminActor, parse(planSchema, b));
  }
  @Patch("plans/:id")
  @ApiBody({ schema: openApiSchema(planSchema) })
  editPlan(
    @Req() r: AdminRequest,
    @Param("id") id: string,
    @Body() b: unknown,
  ) {
    return this.service.savePlan(
      r.adminActor,
      parse(planSchema, b),
      parse(z.uuid(), id),
    );
  }
  @Get("subscriptions") subscriptions(
    @Req() r: AdminRequest,
    @Query() q: unknown,
  ) {
    return this.service.subscriptions(r.adminActor, q);
  }
  @Post("subscriptions")
  @ApiBody({ schema: openApiSchema(subscriptionSchema) })
  saveSubscription(@Req() r: AdminRequest, @Body() b: unknown) {
    return this.service.saveSubscription(
      r.adminActor,
      parse(subscriptionSchema, b),
    );
  }
  @Get("invoices") invoices(@Req() r: AdminRequest, @Query() q: unknown) {
    return this.service.invoices(r.adminActor, q);
  }
  @Post("invoices")
  @ApiBody({ schema: openApiSchema(invoiceSchema) })
  invoice(@Req() r: AdminRequest, @Body() b: unknown) {
    return this.service.createInvoice(r.adminActor, parse(invoiceSchema, b));
  }
  @Post("invoices/:id/void") voidInvoice(
    @Req() r: AdminRequest,
    @Param("id") id: string,
  ) {
    return this.service.voidInvoice(r.adminActor, parse(z.uuid(), id));
  }
  @Get("payments") payments(@Req() r: AdminRequest, @Query() q: unknown) {
    return this.service.payments(r.adminActor, q);
  }
  @Post("payments")
  @ApiBody({ schema: openApiSchema(paymentSchema) })
  payment(@Req() r: AdminRequest, @Body() b: unknown) {
    return this.service.createPayment(r.adminActor, parse(paymentSchema, b));
  }
  @Get("pages") pages(@Req() r: AdminRequest, @Query() q: unknown) {
    return this.service.pages(r.adminActor, q);
  }
  @Post("pages")
  @ApiBody({ schema: openApiSchema(sitePageSchema) })
  page(@Req() r: AdminRequest, @Body() b: unknown) {
    return this.service.savePage(r.adminActor, parse(sitePageSchema, b));
  }
  @Patch("pages/:id")
  @ApiBody({ schema: openApiSchema(sitePageSchema) })
  editPage(
    @Req() r: AdminRequest,
    @Param("id") id: string,
    @Body() b: unknown,
  ) {
    return this.service.savePage(
      r.adminActor,
      parse(sitePageSchema, b),
      parse(z.uuid(), id),
    );
  }
  @Get("settings") settings(@Req() r: AdminRequest) {
    return this.service.settings(r.adminActor);
  }
  @Post("settings")
  @ApiBody({ schema: openApiSchema(settingsSchema) })
  saveSettings(@Req() r: AdminRequest, @Body() b: unknown) {
    return this.service.saveSettings(r.adminActor, parse(settingsSchema, b));
  }
  @Get("countries") countries(@Req() r: AdminRequest, @Query() q: unknown) {
    return this.service.countries(r.adminActor, q);
  }
  @Post("countries")
  @ApiBody({ schema: openApiSchema(countrySchema) })
  country(@Req() r: AdminRequest, @Body() b: unknown) {
    return this.service.saveCountry(r.adminActor, parse(countrySchema, b));
  }
  @Get("admins") admins(@Req() r: AdminRequest, @Query() q: unknown) {
    return this.service.admins(r.adminActor, q);
  }
  @Get("admin-permissions") adminPermissions() {
    return { items: platformPermissions };
  }
  @Post("admins")
  @ApiBody({ schema: openApiSchema(adminCreateSchema) })
  admin(@Req() r: AdminRequest, @Body() b: unknown) {
    return this.service.createAdmin(r.adminActor, parse(adminCreateSchema, b));
  }
  @Patch("admins/:id")
  @ApiBody({ schema: openApiSchema(adminPatchSchema) })
  editAdmin(
    @Req() r: AdminRequest,
    @Param("id") id: string,
    @Body() b: unknown,
  ) {
    return this.service.updateAdmin(
      r.adminActor,
      parse(z.uuid(), id),
      parse(adminPatchSchema, b),
    );
  }
  @Get("audit") audit(@Req() r: AdminRequest, @Query() q: unknown) {
    return this.service.security(r.adminActor, q);
  }
  @Get("monitoring") monitoring(@Req() r: AdminRequest) {
    return this.service.monitoring(r.adminActor);
  }
  @Get("sessions") sessions(@Req() r: AdminRequest, @Query() q: unknown) {
    return this.service.sessions(r.adminActor, q);
  }
  @Post("sessions/:id/revoke") revoke(
    @Req() r: AdminRequest,
    @Param("id") id: string,
  ) {
    return this.service.revokeSession(r.adminActor, parse(z.uuid(), id));
  }
}
@ApiTags("Published website")
@Controller("public")
export class PublishedController {
  @Get("settings") async settings() {
    return (
      (await db.platformSettings.findUnique({
        where: { id: "default" },
        select: {
          brandName: true,
          primaryColor: true,
          supportEmail: true,
          registrationOpen: true,
        },
      })) ?? {
        brandName: "LEGAL OFFICE AI",
        primaryColor: "#087e83",
        supportEmail: null,
        registrationOpen: true,
      }
    );
  }
  @Get("pages") pages() {
    return db.sitePage.findMany({
      where: { status: "PUBLISHED" },
      select: { slug: true, title: true },
      orderBy: { title: "asc" },
      take: 100,
    });
  }
  @Get("pages/:slug") async page(@Param("slug") slug: string) {
    const result = await db.sitePage.findFirst({
      where: { slug, status: "PUBLISHED" },
      select: { slug: true, title: true, body: true, publishedAt: true },
    });
    if (!result) throw new NotFoundException("NOT_FOUND");
    return result;
  }
}
