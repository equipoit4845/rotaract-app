import { IsBoolean, IsEnum, IsOptional, IsString, MinLength } from 'class-validator';
import { MeetingType } from '../../prisma/client';

export class CreateMeetingDto {
  @IsString()
  @MinLength(1)
  title: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  scheduledAt?: string; // ISO date

  @IsString()
  clubId: string;

  @IsOptional()
  @IsEnum(MeetingType)
  type?: MeetingType;

  @IsOptional()
  @IsBoolean()
  isDistrictMeeting?: boolean;
}
