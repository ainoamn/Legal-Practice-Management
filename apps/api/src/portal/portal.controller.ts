import {
  Controller,
  Get,
  Post,
  Patch,
  Req,
  Body,
  Param,
  Res,
  UseGuards,
  Inject,
} from "@nestjs/common";
import { ApiTags, ApiCookieAuth, ApiBody } from "@nestjs/swagger";
import type { Response } from "express";
import { z } from "zod";
import { SessionGuard, parse, type AuthRequest } from "../security.js";
import { openApiSchema } from "../openapi.js";
import { PortalService } from "./portal.service.js";
import {
  clientAccessSchema,
  portalMessageSchema,
  portalRequestSchema,
  portalResponseSchema,
  matterPublicationSchema,
} from "../../../../packages/contracts/src/portal.js";
@ApiTags("Client portal")
@ApiCookieAuth()
@UseGuards(SessionGuard)
@Controller()
export class PortalController {
  constructor(@Inject(PortalService) private readonly service: PortalService) {}
  @Get("portal") snapshot(@Req() r: AuthRequest) {
    return this.service.snapshot(r.actor);
  }
  @Get("portal/messages") messages(@Req() r: AuthRequest) {
    return this.service.messages(r.actor);
  }
  @Post("portal/messages")
  @ApiBody({ schema: openApiSchema(portalMessageSchema) })
  send(@Req() r: AuthRequest, @Body() b: unknown) {
    return this.service.send(r.actor, parse(portalMessageSchema, b).body);
  }
  @Post("portal/requests")
  @ApiBody({ schema: openApiSchema(portalRequestSchema) })
  request(@Req() r: AuthRequest, @Body() b: unknown) {
    return this.service.request(r.actor, parse(portalRequestSchema, b));
  }
  @Get("portal/files/:id") async download(
    @Req() r: AuthRequest,
    @Param("id") id: string,
    @Res() res: Response,
  ) {
    const f = await this.service.download(r.actor, parse(z.uuid(), id));
    res.setHeader("Content-Type", f.mime);
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="document"; filename*=UTF-8''${encodeURIComponent(f.filename).replaceAll("'", "%27")}`,
    );
    res.setHeader("Content-Security-Policy", "default-src 'none'; sandbox");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.send(f.body);
  }
  @Get("practice/clients/:id/portal") staff(
    @Req() r: AuthRequest,
    @Param("id") id: string,
  ) {
    return this.service.staff(r.actor, parse(z.uuid(), id));
  }
  @Post("practice/clients/:id/portal-access")
  @ApiBody({ schema: openApiSchema(clientAccessSchema) })
  link(@Req() r: AuthRequest, @Param("id") id: string, @Body() b: unknown) {
    return this.service.link(
      r.actor,
      parse(z.uuid(), id),
      parse(clientAccessSchema, b),
    );
  }
  @Post("practice/clients/:id/portal-messages")
  @ApiBody({ schema: openApiSchema(portalMessageSchema) })
  reply(@Req() r: AuthRequest, @Param("id") id: string, @Body() b: unknown) {
    return this.service.reply(
      r.actor,
      parse(z.uuid(), id),
      parse(portalMessageSchema, b).body,
    );
  }
  @Post("practice/portal-requests/:id/respond")
  @ApiBody({ schema: openApiSchema(portalResponseSchema) })
  respond(@Req() r: AuthRequest, @Param("id") id: string, @Body() b: unknown) {
    return this.service.respond(
      r.actor,
      parse(z.uuid(), id),
      parse(portalResponseSchema, b),
    );
  }
  @Patch("practice/matters/:id/portal")
  @ApiBody({ schema: openApiSchema(matterPublicationSchema) })
  publish(@Req() r: AuthRequest, @Param("id") id: string, @Body() b: unknown) {
    const p = parse(matterPublicationSchema, b);
    return this.service.publishMatter(
      r.actor,
      parse(z.uuid(), id),
      p.version,
      p.clientVisible,
    );
  }
}
