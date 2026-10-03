import { IsOptional, IsString } from 'class-validator';

export class CreateCartaPoderDto {
  @IsString()
  clubId: string;

  @IsString()
  delegateUserId: string;

  @IsOptional()
  @IsString()
  documentUrl?: string;
}
