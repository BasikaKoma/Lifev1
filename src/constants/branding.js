export const APP_NAME = 'lifev1';

/** Bump when public/monogramm.png or logo.png changes so browsers reload cached icons. */
export const BRAND_ASSET_VERSION = '10';
const assetBase = import.meta.env.BASE_URL;

export const MONOGRAM_SRC = `${assetBase}monogramm.png?v=${BRAND_ASSET_VERSION}`;
export const LOGO_SRC = `${assetBase}logo.png?v=${BRAND_ASSET_VERSION}`;
