/** Google AdSense publisher client ID — override via PUBLIC_ADSENSE_CLIENT_ID in .env */
export const ADSENSE_CLIENT_ID =
  import.meta.env.PUBLIC_ADSENSE_CLIENT_ID ?? 'ca-pub-9843041963430696';

export function adsenseScriptUrl(): string {
  return `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${ADSENSE_CLIENT_ID}`;
}
