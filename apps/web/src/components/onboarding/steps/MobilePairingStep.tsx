import { BirdCodeMobileCompanionPanel } from "../../settings/MobileCompanionPanel";

/**
 * Wraps the existing mobile pairing panel for the onboarding sheet.
 * The panel already handles the localhost-unavailable case gracefully.
 */
export function MobilePairingStep() {
  return (
    <div className="space-y-3">
      <div className="space-y-1">
        <h2 className="text-lg font-semibold tracking-tight">Pair your phone</h2>
        <p className="text-sm text-muted-foreground">
          Continue your coding sessions on mobile. Scan the QR code with Bird Code on your phone.
        </p>
      </div>
      <BirdCodeMobileCompanionPanel />
    </div>
  );
}
