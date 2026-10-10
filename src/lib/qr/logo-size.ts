// The QR centre logo's width as a percentage of the code's width. Pure, so
// the dashboard, the email pass renderer and the tests share one definition.
export const QR_LOGO_SIZE_MIN = 10;
export const QR_LOGO_SIZE_MAX = 30;
export const QR_LOGO_SIZE_DEFAULT = 20;

export function clampQrLogoSize(value: unknown): number {
  const n = Math.round(Number(value));
  if (!Number.isFinite(n)) return QR_LOGO_SIZE_DEFAULT;
  return Math.min(QR_LOGO_SIZE_MAX, Math.max(QR_LOGO_SIZE_MIN, n));
}

export function qrLogoRatio(sizePercent: unknown): number {
  return clampQrLogoSize(sizePercent) / 100;
}
