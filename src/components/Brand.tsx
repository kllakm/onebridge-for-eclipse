export function Brand() {
  return <div className="flex items-center gap-3">
    <img src="/images/onebridge.png" alt="OneBridge logo" className="size-14 shrink-0 object-contain" width={56} height={56} />
    <p className="font-display text-lg font-semibold">OneBridge <span className="text-sm font-normal text-muted-foreground">for Eclipse</span></p>
  </div>;
}