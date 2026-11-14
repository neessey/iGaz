import { IsBoolean, IsInt, IsOptional, IsString, Max, MaxLength, Min, MinLength } from 'class-validator';
import { MAX_REVIEW_TEXT } from './review-rules';

export class ReviewDto {
  @IsInt({ message: 'Choisissez une note de 1 à 5 étoiles' }) @Min(1, { message: 'Choisissez une note de 1 à 5 étoiles' })
  @Max(5, { message: 'Choisissez une note de 1 à 5 étoiles' })
  rating!: number;

  @IsOptional() @IsString() @MaxLength(MAX_REVIEW_TEXT, { message: `Commentaire : ${MAX_REVIEW_TEXT} caractères au plus` })
  comment?: string;
}

export class ReplyDto {
  @IsString() @MinLength(2, { message: 'Écrivez votre réponse' })
  @MaxLength(MAX_REVIEW_TEXT, { message: `Réponse : ${MAX_REVIEW_TEXT} caractères au plus` })
  reply!: string;
}

export class HideReviewDto {
  @IsBoolean() hidden!: boolean;
  @IsOptional() @IsString() @MaxLength(200) reason?: string;
}
