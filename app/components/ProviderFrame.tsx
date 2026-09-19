export function ProviderFrame({ src, title, tall = false }: { src: string; title: string; tall?: boolean }) {
  return (
    <div className={tall ? "provider-shell provider-shell--tall" : "provider-shell"}>
      <div className="provider-bar"><span>SECURE EXTERNAL FEED // HOUSED WITHIN THE CASTLE</span><b>LIVE</b></div>
      <iframe src={src} title={title} loading="lazy" allow="payment *" />
      <noscript><p className="provider-note">This live catalog requires JavaScript to operate.</p></noscript>
    </div>
  );
}

