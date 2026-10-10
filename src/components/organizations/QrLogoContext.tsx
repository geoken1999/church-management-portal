"use client";

import { createContext, useContext, type ReactNode } from "react";

// The church's QR centre logo, available to every QR dialog in the
// dashboard without threading a prop through each page that shows one.
const QrLogoContext = createContext<string | null>(null);

export function QrLogoProvider({ qrLogoUrl, children }: { qrLogoUrl: string | null; children: ReactNode }) {
  return <QrLogoContext.Provider value={qrLogoUrl}>{children}</QrLogoContext.Provider>;
}

export function useQrLogoUrl(): string | null {
  return useContext(QrLogoContext);
}
