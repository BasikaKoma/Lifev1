import { MONOGRAM_SRC, APP_NAME } from '../constants/branding';

export function BrandMark({ className = '', size = 36, alt = APP_NAME }) {
  return (
    <img
      src={MONOGRAM_SRC}
      alt={alt}
      className={className}
      width={size}
      height={size}
      draggable={false}
    />
  );
}
