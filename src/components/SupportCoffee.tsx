const BMC_URL = "https://buymeacoffee.com/enufstyle";

export function SupportCoffee({ className = "", compact = false }: { className?: string; compact?: boolean }) {
  return (
    <section className={`border-t border-border ${className}`}>
      <div className={compact ? "flex flex-col items-center gap-4 py-6 text-center" : "mx-auto flex max-w-2xl flex-col items-center gap-5 px-6 py-10 text-center sm:flex-row sm:justify-between sm:text-left"}>
        <p className="max-w-sm text-sm text-muted-foreground">
          OneBridge is an independent project. If it keeps your music flowing, a coffee helps keep it going.
        </p>
        <a
          href={BMC_URL}
          target="_blank"
          rel="noreferrer"
          aria-label="Support OneBridge on Buy Me a Coffee"
          className="shrink-0 transition hover:opacity-90"
        >
          <img src="/images/bmc-button.svg" alt="Buy me a coffee" width={160} height={45} />
        </a>
      </div>
    </section>
  );
}
