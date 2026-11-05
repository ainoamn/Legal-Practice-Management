import { Body, Controller, Get, Inject, Post, Req, UseGuards } from "@nestjs/common";
import { ApiCookieAuth, ApiTags } from "@nestjs/swagger";
import { z } from "zod";
import { SessionGuard, parse, type AuthRequest } from "../security.js";
import { BillingService } from "./billing.service.js";

@ApiTags("Office billing")
@ApiCookieAuth()
@UseGuards(SessionGuard)
@Controller("billing")
export class BillingController {
  constructor(@Inject(BillingService) private readonly service: BillingService) {}

  @Get("subscription") subscription(@Req() r: AuthRequest) {
    return this.service.subscription(r.actor);
  }

  @Post("trial") trial(@Req() r: AuthRequest, @Body() b: unknown) {
    return this.service.startTrial(r.actor, parse(z.object({ planId: z.uuid() }), b).planId);
  }

  @Post("checkout") checkout() {
    return this.service.checkout();
  }
}
