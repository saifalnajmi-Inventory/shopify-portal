import { Html, Head, Main, NextScript } from 'next/document'

export default function Document() {
  return (
    <Html lang="en">
      <Head>
        {/* Favicon — SN brand mark */}
        <link rel="icon"             href="/favicon.svg" type="image/svg+xml" />
        <link rel="shortcut icon"    href="/favicon.svg" />
        <link rel="apple-touch-icon" href="/favicon.svg" />
        <meta name="theme-color" content="#0a0a0a" />
      </Head>
      <body>
        <Main />
        <NextScript />
      </body>
    </Html>
  )
}
