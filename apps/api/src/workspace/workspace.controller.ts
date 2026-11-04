import { openApiSchema } from "../openapi.js";
import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Req,
  Param,
  Query,
  UseGuards,
  Inject,
} from "@nestjs/common";
import { ApiTags, ApiCookieAuth, ApiBody } from "@nestjs/swagger";
import { z } from "zod";
import {
  memberSchema,
  memberPatchSchema,
  roleSchema,
  tenantPatchSchema,
  permissions,
} from "../../../../packages/contracts/src/index.js";
import { SessionGuard, parse, type AuthRequest } from "../security.js";
import { WorkspaceService } from "./workspace.service.js";
@ApiTags("Workspace")
@ApiCookieAuth()
@UseGuards(SessionGuard)
@Controller()
export class WorkspaceController {
  constructor(
    @Inject(WorkspaceService) private readonly service: WorkspaceService,
  ) {}
  @Get("tenants/current") current(@Req() r: AuthRequest) {
    return this.service.current(r.actor);
  }
  @Patch("tenants/current")
  @ApiBody({ schema: openApiSchema(tenantPatchSchema) })
  update(@Req() r: AuthRequest, @Body() b: unknown) {
    return this.service.updateTenant(r.actor, parse(tenantPatchSchema, b));
  }
  @Get("users") users(@Req() r: AuthRequest, @Query() q: unknown) {
    return this.service.users(r.actor, q);
  }
  @Post("users")
  @ApiBody({ schema: openApiSchema(memberSchema) })
  addUser(@Req() r: AuthRequest, @Body() b: unknown) {
    return this.service.createUser(r.actor, parse(memberSchema, b));
  }
  @Patch("users/:id")
  @ApiBody({ schema: openApiSchema(memberPatchSchema) })
  editUser(@Req() r: AuthRequest, @Param("id") id: string, @Body() b: unknown) {
    return this.service.updateUser(
      r.actor,
      parse(z.uuid(), id),
      parse(memberPatchSchema, b),
    );
  }
  @Get("roles") roles(@Req() r: AuthRequest) {
    return this.service.roles(r.actor);
  }
  @Post("roles")
  @ApiBody({ schema: openApiSchema(roleSchema) })
  addRole(@Req() r: AuthRequest, @Body() b: unknown) {
    return this.service.saveRole(r.actor, parse(roleSchema, b));
  }
  @Patch("roles/:id")
  @ApiBody({ schema: openApiSchema(roleSchema) })
  editRole(@Req() r: AuthRequest, @Param("id") id: string, @Body() b: unknown) {
    return this.service.saveRole(
      r.actor,
      parse(roleSchema, b),
      parse(z.uuid(), id),
    );
  }
  @Get("permissions") permissions() {
    return { items: permissions };
  }
  @Get("audit") audit(@Req() r: AuthRequest, @Query() q: unknown) {
    return this.service.logs(r.actor, q);
  }
  @Get("dashboard") dashboard(@Req() r: AuthRequest) {
    return this.service.dashboard(r.actor);
  }
}
