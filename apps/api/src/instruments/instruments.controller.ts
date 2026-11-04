import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  Query,
  Req,
  Inject,
  UseGuards,
} from "@nestjs/common";
import { ApiTags, ApiCookieAuth, ApiBody } from "@nestjs/swagger";
import { z } from "zod";
import { SessionGuard, parse, type AuthRequest } from "../security.js";
import { openApiSchema } from "../openapi.js";
import { InstrumentsService } from "./instruments.service.js";
import {
  instrumentSchema,
  instrumentPatchSchema,
  instrumentApprovalSchema,
  obligationSchema,
  obligationPatchSchema,
} from "../../../../packages/contracts/src/instruments.js";
@ApiTags("Contracts, powers of attorney and obligations")
@ApiCookieAuth()
@UseGuards(SessionGuard)
@Controller("instruments")
export class InstrumentsController {
  @Get("catalog") catalog(@Req() r: AuthRequest) {
    return this.service.catalog(r.actor);
  }
  constructor(
    @Inject(InstrumentsService) private readonly service: InstrumentsService,
  ) {}
  @Get() list(@Req() r: AuthRequest, @Query() q: unknown) {
    return this.service.list(r.actor, q);
  }
  @Post() @ApiBody({ schema: openApiSchema(instrumentSchema) }) create(
    @Req() r: AuthRequest,
    @Body() b: unknown,
  ) {
    return this.service.create(r.actor, parse(instrumentSchema, b));
  }
  @Get("notifications") notifications(@Req() r: AuthRequest) {
    return this.service.notifications(r.actor);
  }
  @Post("notifications/:id/read") read(
    @Req() r: AuthRequest,
    @Param("id") id: string,
  ) {
    return this.service.read(r.actor, parse(z.uuid(), id));
  }
  @Get(":id") detail(@Req() r: AuthRequest, @Param("id") id: string) {
    return this.service.detail(r.actor, parse(z.uuid(), id));
  }
  @Patch(":id")
  @ApiBody({ schema: openApiSchema(instrumentPatchSchema) })
  update(@Req() r: AuthRequest, @Param("id") id: string, @Body() b: unknown) {
    return this.service.update(
      r.actor,
      parse(z.uuid(), id),
      parse(instrumentPatchSchema, b),
    );
  }
  @Post(":id/approve")
  @ApiBody({ schema: openApiSchema(instrumentApprovalSchema) })
  approve(@Req() r: AuthRequest, @Param("id") id: string, @Body() b: unknown) {
    return this.service.approve(
      r.actor,
      parse(z.uuid(), id),
      parse(instrumentApprovalSchema, b).version,
    );
  }
  @Post(":id/obligations")
  @ApiBody({ schema: openApiSchema(obligationSchema) })
  obligation(
    @Req() r: AuthRequest,
    @Param("id") id: string,
    @Body() b: unknown,
  ) {
    return this.service.obligation(
      r.actor,
      parse(z.uuid(), id),
      parse(obligationSchema, b),
    );
  }
  @Patch(":id/obligations/:obligationId")
  @ApiBody({ schema: openApiSchema(obligationPatchSchema) })
  updateObligation(
    @Req() r: AuthRequest,
    @Param("id") id: string,
    @Param("obligationId") obligationId: string,
    @Body() b: unknown,
  ) {
    return this.service.updateObligation(
      r.actor,
      parse(z.uuid(), id),
      parse(z.uuid(), obligationId),
      parse(obligationPatchSchema, b),
    );
  }
}
