import { IsUUID } from 'class-validator';

export class CreateConversationDto {
  @IsUUID()
  propertyId!: string;
}
