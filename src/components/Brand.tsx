import logo from "@/assets/onebridge.png.asset.json";

// An absolute asset address also works on the owner's external Cloudflare Worker.
const logoUrl = `https://id-preview--69074948-2f07-4d66-b690-91f2f33ad1b7.lovable.app${logo.url}`;

export function Brand() {
  return <div className="flex items-center gap-3">
    <img src={logoUrl} alt="OneBridge logo" className="size-14 shrink-0 object-contain" width={56} height={56} />
    <p className="font-display text-lg font-semibold">OneBridge <span className="text-sm font-normal text-muted-foreground">for Eclipse</span></p>
  </div>;
}