import { PartialType } from '@nestjs/mapped-types';
import { CreateCompanyAdDto } from './create-company-ad.dto';

export class UpdateCompanyAdDto extends PartialType(CreateCompanyAdDto) {}
