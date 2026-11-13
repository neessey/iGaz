import { Transform } from 'class-transformer';
import { IsOptional, IsString, Length, Matches, MaxLength } from 'class-validator';
import { NAME_PATTERN } from './names';

const NAME_MESSAGE = 'Le prénom et le nom ne contiennent que des lettres, espaces, tirets ou apostrophes (40 caractères au plus)';
/** Espaces superflus retirés avant la vérification : « ␣awa␣␣ » est accepté comme « awa ». */
const Squish = () => Transform(({ value }) => (typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : value));

export class RequestOtpDto {
  @IsString() @MaxLength(25)
  phone: string;
}

export class VerifyOtpDto {
  @IsString() @MaxLength(25)
  phone: string;

  @IsString() @Length(6, 6)
  code: string;

  @IsOptional() @IsString() @MaxLength(80)
  name?: string;

  /** Inscription : prénom et nom, enregistrés ensemble sur le compte (« Prénom Nom »). */
  @IsOptional() @Squish() @IsString() @Matches(NAME_PATTERN, { message: NAME_MESSAGE })
  firstName?: string;

  @IsOptional() @Squish() @IsString() @Matches(NAME_PATTERN, { message: NAME_MESSAGE })
  lastName?: string;
}

/** Modifier son prénom et son nom (profil, ou juste après la première connexion). */
export class UpdateMeDto {
  @Squish() @IsString() @Matches(NAME_PATTERN, { message: NAME_MESSAGE })
  firstName: string;

  @Squish() @IsString() @Matches(NAME_PATTERN, { message: NAME_MESSAGE })
  lastName: string;
}
