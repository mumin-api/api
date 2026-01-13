import {
    IsEmail,
    IsString,
    MinLength,
    IsBoolean,
    IsOptional,
} from 'class-validator'

export class RegisterDto {
    @IsEmail()
    email!: string

    @IsString()
    @MinLength(8)
    password!: string

    @IsString()
    @IsOptional()
    displayName?: string

    @IsBoolean()
    tosAccepted!: boolean

    @IsString()
    tosVersion!: string

    @IsBoolean()
    privacyAccepted!: boolean

    @IsString()
    privacyVersion!: string
}
