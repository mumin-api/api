import { IsEmail, IsBoolean, IsString, IsOptional } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class RegisterApiKeyDto {
    @ApiProperty({ example: 'user@example.com' })
    @IsEmail()
    email!: string;

    @ApiProperty({ example: true, description: 'Accept Terms of Service' })
    @IsBoolean()
    acceptTerms!: boolean;

    @ApiProperty({ example: '2.0', description: 'ToS version being accepted' })
    @IsString()
    termsVersion!: string;

    @ApiProperty({ example: true, description: 'Accept Privacy Policy' })
    @IsBoolean()
    acceptPrivacyPolicy!: boolean;

    @ApiProperty({ example: '1.0' })
    @IsString()
    privacyPolicyVersion!: string;

    @ApiProperty({ required: false })
    @IsOptional()
    metadata?: Record<string, any>;
}
