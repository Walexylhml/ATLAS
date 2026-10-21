import { BadRequestException, type PipeTransform } from "@nestjs/common";
import type { ZodType } from "zod";

/**
 * Validates and narrows a request payload against a Zod schema at the edge, so
 * controllers and services only ever see well-formed, typed input. On failure
 * it returns a flat, field-keyed 400 rather than leaking internals.
 *
 *   @Body(new ZodValidationPipe(RequestOtpSchema)) body: RequestOtpDto
 */
export class ZodValidationPipe<T> implements PipeTransform<unknown, T> {
  constructor(private readonly schema: ZodType<T>) {}

  transform(value: unknown): T {
    const result = this.schema.safeParse(value);
    if (!result.success) {
      throw new BadRequestException({
        message: "Validation failed",
        errors: result.error.issues.map((i) => ({
          path: i.path.join("."),
          message: i.message,
        })),
      });
    }
    return result.data;
  }
}
