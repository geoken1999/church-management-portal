"use client";

import { createContext, useContext, type ReactNode } from "react";

export interface QrLogoSetting {
  url: string | null;
  sizePercent: number;
}

// The church's QR centre logo and its size, available to every QR dialog in
// the dashboard without threading props through each page that shows one.
const QrLogoContext = createContext<QrLogoSetting>({ url: null, sizePercent: 20 });

export function QrLogoProvider({ value, children }: { value: QrLogoSetting; children: ReactNode }) {
  return <QrLogoContext.Provider value={value}>{children}</QrLogoContext.Provider>;
}

export function useQrLogo(): QrLogoSetting {
  return useContext(QrLogoContext);
}
