import { IsEnum, IsInt, IsOptional, IsString, Min, MinLength } from 'class-validator';
import { TopicStatus, TopicType } from '../../prisma/client';

export class UpdateTopicDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  title?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  order?: number;

  @IsOptional()
  @IsEnum(TopicType)
  type?: TopicType;

  @IsOptional()
  @IsInt()
  @Min(0)
  estimatedDurationSec?: number;

  @IsOptional()
  @IsEnum(TopicStatus)
  status?: TopicStatus;
}
