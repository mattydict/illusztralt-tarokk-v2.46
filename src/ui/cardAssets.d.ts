export interface CardAssetLike {
  kind: string;
  rank: number | string;
  suit?: string;
}
export declare function cardDisplayName(card: CardAssetLike): string;
export declare function cardImageFile(card: CardAssetLike): string;
export declare function cardImageSrc(card: CardAssetLike): string;
