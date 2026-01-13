import { IsInt, IsString, IsOptional, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';

export class GetHadithsDto {
    @ApiProperty({ required: false, default: 1 })
    @IsOptional()
    @Type(() => Number)
    @IsInt()
    @Min(1)
    page?: number = 1;

    @ApiProperty({ required: false, default: 20 })
    @IsOptional()
    @Type(() => Number)
    @IsInt()
    @Min(1)
    limit?: number = 20;

    @ApiProperty({ required: false })
    @IsOptional()
    @IsString()
    collection?: string;

    @ApiProperty({ required: false })
    @IsOptional()
    @Type(() => Number)
    @IsInt()
    bookNumber?: number;

    @ApiProperty({ required: false })
    @IsOptional()
    @Type(() => Number)
    @IsInt()
    hadithNumber?: number;

    @ApiProperty({ required: false })
    @IsOptional()
    @IsString()
    language?: string = 'en';

    @ApiProperty({ required: false })
    @IsOptional()
    @IsString()
    grade?: string;
}
