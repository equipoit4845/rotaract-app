import { IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateTranscriptionDto {
  @IsString()
  @MaxLength(10000)
  text: string;

  /** Nombre del invitado en cuyo nombre habla la secretaría/RDR (opcional). */
  @IsOptional()
  @IsString()
  @MaxLength(120)
  speakerName?: string;
}
