import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  Req,
  Res,
  UploadedFile,
  UseInterceptors,
  UseGuards,
  Inject,
  BadRequestException,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { ApiTags, ApiCookieAuth, ApiBody, ApiConsumes } from "@nestjs/swagger";
import type { Response } from "express";
import { z } from "zod";
import { SessionGuard, parse, type AuthRequest } from "../security.js";
import { openApiSchema } from "../openapi.js";
import { DocumentsService } from "./documents.service.js";
import { DocumentJobs } from "./document-jobs.js";
import {
  documentSchema,
  draftSchema,
  reviewDocumentSchema,
  publishDocumentSchema,
  templateSchema,
} from "../../../../packages/contracts/src/documents.js";
@ApiTags("Documents")
@ApiCookieAuth()
@UseGuards(SessionGuard)
@Controller("practice/documents")
export class DocumentsController {
  constructor(
    @Inject(DocumentsService) private readonly service: DocumentsService,
    @Inject(DocumentJobs) private readonly jobs: DocumentJobs,
  ) {}
  @Get() list(@Req() r: AuthRequest, @Query() q: unknown) {
    return this.service.list(r.actor, q);
  }
  @Get("templates") templates(@Req() r: AuthRequest) {
    return this.service.templates(r.actor);
  }
  @Post("templates")
  @ApiBody({ schema: openApiSchema(templateSchema) })
  template(@Req() r: AuthRequest, @Body() b: unknown) {
    return this.service.saveTemplate(r.actor, parse(templateSchema, b));
  }
  @Post() @ApiBody({ schema: openApiSchema(documentSchema) }) async create(
    @Req() r: AuthRequest,
    @Body() b: unknown,
  ) {
    const result = await this.service.create(r.actor, parse(documentSchema, b));
    const d = await this.service.detail(r.actor, result.id);
    if (d.versions[0])
      await this.jobs.enqueue({
        tenantId: r.actor.tenantId,
        memberId: r.actor.membershipId,
        versionId: d.versions[0].id,
      });
    return result;
  }
  @Get(":id") detail(@Req() r: AuthRequest, @Param("id") id: string) {
    return this.service.detail(r.actor, parse(z.uuid(), id));
  }
  @Post(":id/drafts")
  @ApiBody({ schema: openApiSchema(draftSchema) })
  async draft(
    @Req() r: AuthRequest,
    @Param("id") id: string,
    @Body() b: unknown,
  ) {
    const input = parse(draftSchema, b);
    const result = await this.service.upload(
      r.actor,
      parse(z.uuid(), id),
      Buffer.from(input.body, "utf8"),
      "draft.txt",
      input.expectedVersion,
    );
    await this.jobs.enqueue({
      tenantId: r.actor.tenantId,
      memberId: r.actor.membershipId,
      versionId: result.id,
    });
    return result;
  }
  @Post(":id/files")
  @ApiConsumes("multipart/form-data")
  @UseInterceptors(
    FileInterceptor("file", {
      limits: { fileSize: 25 * 1024 * 1024, files: 1, fields: 1, parts: 2 },
    }),
  )
  async upload(
    @Req() r: AuthRequest,
    @Param("id") id: string,
    @UploadedFile() file: { buffer: Buffer; originalname: string } | undefined,
  ) {
    if (!file) throw new BadRequestException("FILE_REQUIRED");
    const result = await this.service.upload(
      r.actor,
      parse(z.uuid(), id),
      file.buffer,
      file.originalname,
    );
    await this.jobs.enqueue({
      tenantId: r.actor.tenantId,
      memberId: r.actor.membershipId,
      versionId: result.id,
    });
    return result;
  }
  @Post(":id/review")
  @ApiBody({ schema: openApiSchema(reviewDocumentSchema) })
  review(@Req() r: AuthRequest, @Param("id") id: string, @Body() b: unknown) {
    const input = parse(reviewDocumentSchema, b);
    return this.service.review(
      r.actor,
      parse(z.uuid(), id),
      input.expectedVersion,
      input.reviewedText,
    );
  }
  @Post(":id/approve")
  @ApiBody({ schema: openApiSchema(publishDocumentSchema) })
  approve(@Req() r: AuthRequest, @Param("id") id: string, @Body() b: unknown) {
    const input = parse(publishDocumentSchema, b);
    return this.service.approve(
      r.actor,
      parse(z.uuid(), id),
      input.expectedVersion,
      input.clientVisible,
    );
  }
  @Post(":id/archive") archive(@Req() r: AuthRequest, @Param("id") id: string) {
    return this.service.archive(r.actor, parse(z.uuid(), id));
  }
  private send(
    response: Response,
    file: { body: Buffer; filename: string; mime: string },
    inline = false,
  ) {
    response.setHeader("Content-Type", file.mime);
    response.setHeader(
      "Content-Disposition",
      `${inline ? "inline" : "attachment"}; filename="document"; filename*=UTF-8''${encodeURIComponent(file.filename).replaceAll("'", "%27")}`,
    );
    response.setHeader(
      "Content-Security-Policy",
      "default-src 'none'; sandbox",
    );
    response.setHeader("X-Content-Type-Options", "nosniff");
    response.send(file.body);
  }
  @Post(":id/versions/:versionId/retry") async retry(
    @Req() r: AuthRequest,
    @Param("id") id: string,
    @Param("versionId") versionId: string,
  ) {
    const version = parse(z.uuid(), versionId);
    const result = await this.service.retry(
      r.actor,
      parse(z.uuid(), id),
      version,
    );
    await this.jobs.enqueue({
      tenantId: r.actor.tenantId,
      memberId: r.actor.membershipId,
      versionId: version,
    });
    return result;
  }
  @Get(":id/versions/:versionId/download") async download(
    @Req() r: AuthRequest,
    @Param("id") id: string,
    @Param("versionId") versionId: string,
    @Res() response: Response,
  ) {
    this.send(
      response,
      await this.service.download(
        r.actor,
        parse(z.uuid(), id),
        parse(z.uuid(), versionId),
      ),
    );
  }
  @Get(":id/export/:format") async export(
    @Req() r: AuthRequest,
    @Param("id") id: string,
    @Param("format") format: string,
    @Res() response: Response,
  ) {
    this.send(
      response,
      await this.service.export(
        r.actor,
        parse(z.uuid(), id),
        parse(z.enum(["pdf", "docx"]), format),
      ),
    );
  }
  @Get(":id/preview") async preview(
    @Req() r: AuthRequest,
    @Param("id") id: string,
    @Res() response: Response,
  ) {
    this.send(
      response,
      await this.service.export(r.actor, parse(z.uuid(), id), "pdf"),
      true,
    );
  }
}
