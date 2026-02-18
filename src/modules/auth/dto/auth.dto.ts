import { IsEmail, IsNotEmpty, IsString, MinLength, IsOptional } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class RegisterDto {
    @ApiProperty({ example: 'user@example.com' })
    @IsEmail()
    @IsNotEmpty()
    email!: string;

    @ApiProperty({ example: 'password123', minLength: 6 })
    @IsNotEmpty()
    @IsString()
    @MinLength(6)
    password!: string;

    @ApiProperty({ example: 'John', required: false })
    @IsString()
    @IsOptional()
    firstName?: string;

    @ApiProperty({ example: 'Doe', required: false })
    @IsString()
    @IsOptional()
    lastName?: string;

    @IsOptional()
    acceptTerms?: boolean;

    @IsOptional()
    termsVersion?: string;

    @IsOptional()
    acceptPrivacyPolicy?: boolean;

    @IsOptional()
    privacyPolicyVersion?: string;

}

export class LoginDto {
    @ApiProperty({ example: 'user@example.com' })
    @IsEmail()
    @IsNotEmpty()
    email!: string;

    @ApiProperty({ example: 'password123' })
    @IsNotEmpty()
    @IsString()
    password!: string;
}

export class UpdateProfileDto {
    @ApiProperty({ example: 'user@example.com', required: false })
    @IsEmail()
    @IsOptional()
    email?: string;

    @ApiProperty({ example: 'John Doe', required: false })
    @IsString()
    @IsOptional()
    displayName?: string;

    @ApiProperty({ example: 'John', required: false })
    @IsString()
    @IsOptional()
    firstName?: string;

    @ApiProperty({ example: 'Doe', required: false })
    @IsString()
    @IsOptional()
    lastName?: string;
}

export class ClaimTelegramDto {
    @ApiProperty({ example: 'uuid-token-here' })
    @IsNotEmpty()
    @IsString()
    token!: string;
}

export class RequestEmailChangeDto {
    @ApiProperty({ example: 'new-email@example.com' })
    @IsEmail()
    @IsNotEmpty()
    newEmail!: string;
}

export class VerifyEmailChangeDto {
    @ApiProperty({ example: '123456' })
    @IsString()
    @IsNotEmpty()
    @MinLength(6)
    code!: string;
}
