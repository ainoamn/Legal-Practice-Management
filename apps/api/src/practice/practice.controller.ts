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
import { PracticeService } from "./practice.service.js";
import {
  clientSchema,
  clientPatchSchema,
  courtSchema,
  matterSchema,
  matterPatchSchema,
  assignmentSchema,
  partySchema,
  noteSchema,
  hearingSchema,
  hearingPatchSchema,
  taskSchema,
  taskPatchSchema,
} from "../../../../packages/contracts/src/practice.js";
@ApiTags("Legal practice")
@ApiCookieAuth()
@UseGuards(SessionGuard)
@Controller("practice")
export class PracticeController {
  constructor(
    @Inject(PracticeService) private readonly service: PracticeService,
  ) {}
  @Get("overview") overview(@Req() r: AuthRequest) {
    return this.service.overview(r.actor);
  }
  @Get("calendar") calendar(@Req() r: AuthRequest, @Query() q: unknown) {
    return this.service.calendar(r.actor, q);
  }
  @Get("clients") clients(@Req() r: AuthRequest, @Query() q: unknown) {
    return this.service.clients(r.actor, q);
  }
  @Post("clients")
  @ApiBody({ schema: openApiSchema(clientSchema) })
  createClient(@Req() r: AuthRequest, @Body() b: unknown) {
    return this.service.saveClient(r.actor, parse(clientSchema, b));
  }
  @Get("clients/:id") client(@Req() r: AuthRequest, @Param("id") id: string) {
    return this.service.clientDetail(r.actor, parse(z.uuid(), id));
  }
  @Patch("clients/:id")
  @ApiBody({ schema: openApiSchema(clientPatchSchema) })
  updateClient(
    @Req() r: AuthRequest,
    @Param("id") id: string,
    @Body() b: unknown,
  ) {
    return this.service.saveClient(
      r.actor,
      parse(clientPatchSchema, b),
      parse(z.uuid(), id),
    );
  }
  @Get("courts") courts(@Req() r: AuthRequest) {
    return this.service.courts(r.actor);
  }
  @Post("courts") @ApiBody({ schema: openApiSchema(courtSchema) }) createCourt(
    @Req() r: AuthRequest,
    @Body() b: unknown,
  ) {
    return this.service.createCourt(r.actor, parse(courtSchema, b));
  }
  @Get("matters") matters(@Req() r: AuthRequest, @Query() q: unknown) {
    return this.service.matters(r.actor, q);
  }
  @Post("matters")
  @ApiBody({ schema: openApiSchema(matterSchema) })
  createMatter(@Req() r: AuthRequest, @Body() b: unknown) {
    return this.service.createMatter(r.actor, parse(matterSchema, b));
  }
  @Get("matters/:id") detail(@Req() r: AuthRequest, @Param("id") id: string) {
    return this.service.detail(r.actor, parse(z.uuid(), id));
  }
  @Patch("matters/:id")
  @ApiBody({ schema: openApiSchema(matterPatchSchema) })
  updateMatter(
    @Req() r: AuthRequest,
    @Param("id") id: string,
    @Body() b: unknown,
  ) {
    return this.service.updateMatter(
      r.actor,
      parse(z.uuid(), id),
      parse(matterPatchSchema, b),
    );
  }
  @Post("matters/:id/assignments")
  @ApiBody({ schema: openApiSchema(assignmentSchema) })
  assign(@Req() r: AuthRequest, @Param("id") id: string, @Body() b: unknown) {
    return this.service.assign(
      r.actor,
      parse(z.uuid(), id),
      parse(assignmentSchema, b),
    );
  }
  @Post("matters/:id/parties")
  @ApiBody({ schema: openApiSchema(partySchema) })
  party(@Req() r: AuthRequest, @Param("id") id: string, @Body() b: unknown) {
    return this.service.addParty(
      r.actor,
      parse(z.uuid(), id),
      parse(partySchema, b),
    );
  }
  @Post("matters/:id/notes")
  @ApiBody({ schema: openApiSchema(noteSchema) })
  note(@Req() r: AuthRequest, @Param("id") id: string, @Body() b: unknown) {
    return this.service.addNote(
      r.actor,
      parse(z.uuid(), id),
      parse(noteSchema, b).body,
    );
  }
  @Get("conflicts") conflicts(@Req() r: AuthRequest, @Query() q: unknown) {
    return this.service.conflicts(r.actor, q);
  }
  @Get("hearings") hearings(@Req() r: AuthRequest, @Query() q: unknown) {
    return this.service.hearings(r.actor, q);
  }
  @Post("hearings")
  @ApiBody({ schema: openApiSchema(hearingSchema) })
  createHearing(@Req() r: AuthRequest, @Body() b: unknown) {
    return this.service.createHearing(r.actor, parse(hearingSchema, b));
  }
  @Patch("hearings/:id")
  @ApiBody({ schema: openApiSchema(hearingPatchSchema) })
  updateHearing(
    @Req() r: AuthRequest,
    @Param("id") id: string,
    @Body() b: unknown,
  ) {
    return this.service.updateHearing(
      r.actor,
      parse(z.uuid(), id),
      parse(hearingPatchSchema, b),
    );
  }
  @Get("tasks") tasks(@Req() r: AuthRequest, @Query() q: unknown) {
    return this.service.tasks(r.actor, q);
  }
  @Post("tasks") @ApiBody({ schema: openApiSchema(taskSchema) }) createTask(
    @Req() r: AuthRequest,
    @Body() b: unknown,
  ) {
    return this.service.createTask(r.actor, parse(taskSchema, b));
  }
  @Patch("tasks/:id")
  @ApiBody({ schema: openApiSchema(taskPatchSchema) })
  updateTask(
    @Req() r: AuthRequest,
    @Param("id") id: string,
    @Body() b: unknown,
  ) {
    return this.service.updateTask(
      r.actor,
      parse(z.uuid(), id),
      parse(taskPatchSchema, b),
    );
  }
  @Get("notifications") notifications(@Req() r: AuthRequest) {
    return this.service.notifications(r.actor);
  }
  @Post("notifications/:id/read") read(
    @Req() r: AuthRequest,
    @Param("id") id: string,
  ) {
    return this.service.readNotification(r.actor, parse(z.uuid(), id));
  }
}
