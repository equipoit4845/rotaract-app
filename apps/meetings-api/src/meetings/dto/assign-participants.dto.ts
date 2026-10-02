import { IsArray, IsBoolean, IsOptional, IsString } from 'class-validator';

export class AssignParticipantDto {
  @IsString()
  userId: string;

  @IsOptional()
  @IsBoolean()
  canVote?: boolean;
}

export class AssignParticipantsDto {
  @IsArray()
  participants: AssignParticipantDto[];
}
