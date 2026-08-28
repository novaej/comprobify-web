'use client';

import { useEffect, useRef, useState } from 'react';
import Script from 'next/script';
import { useLocale, useTranslations } from 'next-intl';
import { Loader2 } from 'lucide-react';
import type { ApiPayphoneSession } from '@/lib/api';

// Cajita de Pagos v2.0 — see docs.payphone.app/cajita-de-pagos. No responseUrl
// config here: the return redirect is a fixed URL registered in Payphone's own
// developer console (ADR-028), not something the widget takes per session.
const PAYPHONE_CSS_URL = 'https://cdn.payphonetodoesposible.com/box/v2.0/payphone-payment-box.css';
const PAYPHONE_JS_URL = 'https://cdn.payphonetodoesposible.com/box/v2.0/payphone-payment-box.js';
const CONTAINER_ID = 'pp-button';

interface PayphoneWidgetConfig {
  token: string;
  clientTransactionId: string;
  amount: number;
  amountWithoutTax: number;
  amountWithTax: number;
  tax: number;
  service: number;
  tip: number;
  currency: string;
  storeId: string;
  reference: string;
  lang?: 'es' | 'en';
}

declare global {
  interface Window {
    PPaymentButtonBox?: new (config: PayphoneWidgetConfig) => { render(containerId: string): void };
  }
}

// Renders Payphone's embedded card-payment widget for one minted session. The
// parent should mount this with `key={session.clientTransactionId}` — a fresh
// session (e.g. after a declined attempt) needs a fresh widget instance, not a
// re-render of this one, since the widget can only be attached once.
export function PayphoneCheckout({ session }: { session: ApiPayphoneSession }) {
  const locale = useLocale();
  const t = useTranslations('billing');
  const [scriptReady, setScriptReady] = useState(false);
  const renderedRef = useRef(false);

  useEffect(() => {
    if (!scriptReady || renderedRef.current || !window.PPaymentButtonBox) return;
    renderedRef.current = true;
    new window.PPaymentButtonBox({
      token: session.token,
      clientTransactionId: session.clientTransactionId,
      amount: session.amount,
      amountWithoutTax: session.amountWithoutTax,
      amountWithTax: session.amountWithTax,
      tax: session.tax,
      service: session.service,
      tip: session.tip,
      currency: session.currency,
      storeId: session.storeId,
      reference: session.reference,
      lang: locale === 'en' ? 'en' : 'es',
    }).render(CONTAINER_ID);
  }, [scriptReady, session, locale]);

  return (
    <div>
      <link rel="stylesheet" href={PAYPHONE_CSS_URL} />
      <Script src={PAYPHONE_JS_URL} strategy="afterInteractive" onReady={() => setScriptReady(true)} />
      {!scriptReady && (
        <div className="flex items-center gap-2 py-3 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          {t('payphone.loadingWidget')}
        </div>
      )}
      <div id={CONTAINER_ID} />
    </div>
  );
}
