import { IsArray, IsBoolean, IsOptional, IsString } from 'class-validator';

export class BulkImportedBrokerContactsDto {
  @IsArray()
  @IsString({ each: true })
  ids!: string[];

  @IsOptional()
  @IsString()
  outreachStatus?: string;

  @IsOptional()
  @IsString()
  status?: string;

  @IsOptional()
  @IsBoolean()
  profileCreated?: boolean;
}
