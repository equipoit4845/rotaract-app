import { IsArray, IsString } from 'class-validator';

export class ReorderTopicsDto {
  @IsArray()
  @IsString({ each: true })
  topicIds: string[];
}
