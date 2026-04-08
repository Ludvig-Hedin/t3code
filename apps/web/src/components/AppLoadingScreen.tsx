import { BirdLogomark } from "./BirdLogo";
import { Spinner } from "./ui/spinner";

/** Full-screen splash shown while the app is loading or navigating. */
export function AppLoadingScreen() {
  return (
    <div className="flex h-screen w-screen flex-col items-center justify-center gap-4 bg-background text-foreground">
      {/* Logo pulses to indicate the app is alive and loading */}
      <BirdLogomark className="size-12 animate-pulse text-foreground/60" />
      <Spinner className="size-4 text-muted-foreground/50" />
    </div>
  );
}
