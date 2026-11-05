import { Body, Controller, Get, Inject, Post, Req, UseGuards } from "@nestjs/common";
import { ApiCookieAuth, ApiTags } from "@nestjs/swagger";
import { z } from "zod";
import { SessionGuard, parse, type AuthRequest } from "../security.js";
import { AiService } from "./ai.service.js";

const askSchema = z.object({
  matterId: z.uuid(),
  question: z.string().trim().min(3).max(2000),
});

@ApiTags("Legal assistant")
@ApiCookieAuth()
@UseGuards(SessionGuard)
@Controller("ai")
export class AiController {
  constructor(@Inject(AiService) private readonly service: AiService) {}

  @Get("status") status(@Req() r: AuthRequest) {
    return this.service.status(r.actor);
  }

  @Post("ask") ask(@Req() r: AuthRequest, @Body() b: unknown) {
    const input = parse(askSchema, b);
    return this.service.ask(r.actor, input.matterId, input.question);
  }
}
