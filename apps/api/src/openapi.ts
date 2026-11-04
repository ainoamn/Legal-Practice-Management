import { z } from "zod";
import type { OpenAPIObject } from "@nestjs/swagger";
type SchemaObject = NonNullable<
  NonNullable<OpenAPIObject["components"]>["schemas"]
>[string];
export function openApiSchema(schema: z.ZodType): SchemaObject {
  // Zod emits an OpenAPI 3.0 schema here. Its wider TS JSONSchema type also permits
  // boolean schemas, which OpenAPI 3.0 forbids; the explicit target removes those.
  return z.toJSONSchema(schema, {
    target: "openapi-3.0",
    io: "input",
    unrepresentable: "any",
  }) as SchemaObject;
}
