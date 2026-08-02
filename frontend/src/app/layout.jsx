import "./globals.css";
import "./custom-style.css";

import { AppProvider } from "./Components/Context/AppContext";
import { ThemeProvider } from "./Components/Context/ThemeContext";
import PageLayout from "./Components/Layout/PageLayout";
import { TranslationsProvider } from "../i18n/TranslationsProvider";
import { LanguageProvider } from "../i18n/LanguageContext";
import { getTranslations, INITIAL_LOCALE } from "../i18n/config";
import { Suspense } from "react";
import Loading from "./Common/Loading";

export const metadata = {
  title: "Open Suite",
  description: "Open BSW bureaublad",
};

export default async function RootLayout({ children }) {
  const messages = await getTranslations(INITIAL_LOCALE);
  return (
    <html lang={INITIAL_LOCALE}>
      <body suppressHydrationWarning>
        <LanguageProvider initialLocale={INITIAL_LOCALE}>
          <TranslationsProvider initialMessages={messages}>
            <AppProvider>
              <ThemeProvider>
                <PageLayout>
                  <Suspense fallback={<Loading />}>{children}</Suspense>
                </PageLayout>
              </ThemeProvider>
            </AppProvider>
          </TranslationsProvider>
        </LanguageProvider>
      </body>
    </html>
  );
}
