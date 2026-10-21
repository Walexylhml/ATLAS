import { Module } from "@nestjs/common";
import { AcademicController } from "./academic.controller.js";
import { AcademicService } from "./academic.service.js";

/** Academic structure, calendar and grading configuration. */
@Module({
  controllers: [AcademicController],
  providers: [AcademicService],
  exports: [AcademicService],
})
export class AcademicModule {}
