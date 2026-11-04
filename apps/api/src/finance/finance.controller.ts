import {
  Controller,
  Get,
  Post,
  Req,
  Body,
  Query,
  Param,
  Inject,
  UseGuards,
} from "@nestjs/common";
import { ApiTags, ApiCookieAuth, ApiBody } from "@nestjs/swagger";
import { z } from "zod";
import { SessionGuard, parse, type AuthRequest } from "../security.js";
import { openApiSchema } from "../openapi.js";
import { FinanceService } from "./finance.service.js";
import {
  officeInvoiceSchema,
  invoiceIssueSchema,
  officeReceiptSchema,
  expenseSchema,
  trustSchema,
  feeSchema,
  timeEntrySchema,
  manualJournalSchema,
} from "../../../../packages/contracts/src/finance.js";
@ApiTags("Firm accounting")
@ApiCookieAuth()
@UseGuards(SessionGuard)
@Controller("finance")
export class FinanceController {
  @Post("accounts/initialize") initialize(@Req() r: AuthRequest) {
    return this.service.initialize(r.actor);
  }
  constructor(
    @Inject(FinanceService) private readonly service: FinanceService,
  ) {}
  @Get("directory") directory(@Req() r: AuthRequest, @Query() q: unknown) {
    return this.service.directory(r.actor, q);
  }
  @Get("invoices") invoices(@Req() r: AuthRequest, @Query() q: unknown) {
    return this.service.invoices(r.actor, q);
  }
  @Post("invoices")
  @ApiBody({ schema: openApiSchema(officeInvoiceSchema) })
  invoice(@Req() r: AuthRequest, @Body() b: unknown) {
    return this.service.createInvoice(r.actor, parse(officeInvoiceSchema, b));
  }
  @Post("invoices/:id/issue")
  @ApiBody({ schema: openApiSchema(invoiceIssueSchema) })
  issue(@Req() r: AuthRequest, @Param("id") id: string, @Body() b: unknown) {
    return this.service.issue(
      r.actor,
      parse(z.uuid(), id),
      parse(invoiceIssueSchema, b).clientVisible,
    );
  }
  @Post("invoices/:id/void") void(
    @Req() r: AuthRequest,
    @Param("id") id: string,
  ) {
    return this.service.voidDraft(r.actor, parse(z.uuid(), id));
  }
  @Post("receipts")
  @ApiBody({ schema: openApiSchema(officeReceiptSchema) })
  receipt(@Req() r: AuthRequest, @Body() b: unknown) {
    return this.service.receipt(r.actor, parse(officeReceiptSchema, b));
  }
  @Get("expenses") expenses(@Req() r: AuthRequest, @Query() q: unknown) {
    return this.service.expenses(r.actor, q);
  }
  @Post("expenses") @ApiBody({ schema: openApiSchema(expenseSchema) }) expense(
    @Req() r: AuthRequest,
    @Body() b: unknown,
  ) {
    return this.service.createExpense(r.actor, parse(expenseSchema, b));
  }
  @Post("expenses/:id/approve") approve(
    @Req() r: AuthRequest,
    @Param("id") id: string,
  ) {
    return this.service.approveExpense(r.actor, parse(z.uuid(), id));
  }
  @Post("trust") @ApiBody({ schema: openApiSchema(trustSchema) }) trust(
    @Req() r: AuthRequest,
    @Body() b: unknown,
  ) {
    return this.service.trust(r.actor, parse(trustSchema, b));
  }
  @Get("fees") fees(@Req() r: AuthRequest) {
    return this.service.fees(r.actor);
  }
  @Post("fees") @ApiBody({ schema: openApiSchema(feeSchema) }) fee(
    @Req() r: AuthRequest,
    @Body() b: unknown,
  ) {
    return this.service.createFee(r.actor, parse(feeSchema, b));
  }
  @Get("time") time(@Req() r: AuthRequest) {
    return this.service.time(r.actor);
  }
  @Post("time") @ApiBody({ schema: openApiSchema(timeEntrySchema) }) addTime(
    @Req() r: AuthRequest,
    @Body() b: unknown,
  ) {
    return this.service.createTime(r.actor, parse(timeEntrySchema, b));
  }
  @Get("journals") journals(@Req() r: AuthRequest, @Query() q: unknown) {
    return this.service.journals(r.actor, q);
  }
  @Post("journals")
  @ApiBody({ schema: openApiSchema(manualJournalSchema) })
  journal(@Req() r: AuthRequest, @Body() b: unknown) {
    return this.service.manual(r.actor, parse(manualJournalSchema, b));
  }
  @Get("reports") reports(@Req() r: AuthRequest, @Query() q: unknown) {
    return this.service.reports(r.actor, q);
  }
}
