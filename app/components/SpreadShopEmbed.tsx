"use client";

import { useEffect } from "react";

declare global {
  interface Window {
    spread_shop_config?: { shopName: string; locale: string; prefix: string; baseId: string };
  }
}

export function SpreadShopEmbed() {
  useEffect(() => {
    window.spread_shop_config = {
      shopName: "hellharbor",
      locale: "us_US",
      prefix: "https://hellharbor.myspreadshop.com",
      baseId: "myShop",
    };

    const existing = document.querySelector<HTMLScriptElement>('script[data-hell-harbor-spreadshop="true"]');
    if (existing) return;
    const script = document.createElement("script");
    script.src = "https://hellharbor.myspreadshop.com/shopfiles/shopclient/shopclient.nocache.js";
    script.async = true;
    script.dataset.hellHarborSpreadshop = "true";
    document.body.appendChild(script);
    return () => script.remove();
  }, []);

  return (
    <div className="provider-shell provider-shell--light">
      <div className="provider-bar"><span>OFFICIAL RELICS // SPREADSHOP CATALOG</span><b>LIVE INVENTORY</b></div>
      <div id="myShop" className="spreadshop-mount">
        <div className="provider-loading"><i /><span>Summoning the merchandise catalog…</span></div>
        <a href="https://hellharbor.myspreadshop.com">Open the merchandise catalog</a>
      </div>
    </div>
  );
}

