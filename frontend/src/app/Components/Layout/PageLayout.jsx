"use client";
import { FloatButton, Layout } from "antd";
import HeaderLayout from "./Components/HeaderLayout";
import { useAppContext } from "../Context/AppContext";
import { useFetchWithRefresh } from "@/app/Common/CustomHooks/useFetchWithRefresh";
import { usePathname } from "next/navigation";
import { useTranslations } from "../../../i18n/TranslationsProvider";
import ExternalApp from "@/app/Common/ExternalApp";
import { MessageOutlined } from "@ant-design/icons";
import Loading from "@/app/Common/Loading";
import ErrorResult from "@/app/Common/ErrorResult";
import { nativeLoginRetryUrl } from "@/lib/silentLogin";
const { Content, Footer } = Layout;

export default function PageLayout({ children }) {
  const t = useTranslations("Footer");
  const tLogin = useTranslations("LoginPage");
  const { appConfig, authFailure, error, loading } = useAppContext();
  const profileEnabled = !loading && !error && !authFailure;
  const {
    data,
    loading: profileLoading,
    error: profileError,
  } = useFetchWithRefresh("/auth/profile", {}, { enabled: profileEnabled });
  const profilePending =
    profileEnabled && (profileLoading || (!data?.name && !profileError));
  const pathname = usePathname();

  // Get all embedded apps (apps with iframe: true)
  const embeddedApps =
    appConfig?.applications?.filter((app) => app.iframe && app.url) || [];
  const currentAppId = pathname.slice(1); // Remove leading slash
  const isEmbeddedAppRoute = embeddedApps.some(
    (app) => app?.id === currentAppId,
  );

  return (
    <Layout>
      <HeaderLayout
        isProfile={!profileEnabled || profilePending}
        profile={data?.name}
        redirectUrl={appConfig?.redirect_to_account_page}
        isAffixHeader={!isEmbeddedAppRoute} // Affix header for embedded app routes
        isAdmin={appConfig?.is_admin}
      />
      <Content
        className={!isEmbeddedAppRoute ? "homepage-layout" : "layout-iframe"}
      >
        <div className="content">
          {loading ? (
            <Loading />
          ) : authFailure ? (
            <ErrorResult
              errorStatus="error"
              title={tLogin("failedTitle")}
              subTitle={tLogin("failedMessage")}
              btnTitle={tLogin("loginButton")}
              btnLink={nativeLoginRetryUrl()}
            />
          ) : (
            <>
              {/* Render all embedded apps at once, show/hide based on route */}
              {embeddedApps.map((app) => {
                const isActive = currentAppId === app?.id;
                const isMatrix = app?.id === "matrix";

                return (
                  <div
                    key={app.id}
                    style={{
                      // Use visibility:hidden for Matrix to prevent cache clearing issues
                      ...(isMatrix
                        ? {
                            visibility: isActive ? "visible" : "hidden",
                            position: isActive ? "relative" : "absolute",
                            height: "100%",
                            width: "100%",
                          }
                        : {
                            display: isActive ? "block" : "none",
                            height: "100%",
                          }),
                    }}
                  >
                    <ExternalApp appId={app.id} />
                  </div>
                );
              })}
              {/* Render children for non-embedded routes */}
              {!isEmbeddedAppRoute && children}
            </>
          )}
        </div>
      </Content>
      {appConfig?.helpdesk_url && (
        <FloatButton
          shape="circle"
          style={{ insetInlineEnd: 40, insetBlockEnd: 80 }}
          icon={<MessageOutlined />}
          href={appConfig?.helpdesk_url}
          tooltip={t("helpdesk")}
        />
      )}
      {!isEmbeddedAppRoute && (
        <Footer>
          {t("copyright")}
          {new Date().getFullYear()}
        </Footer>
      )}
    </Layout>
  );
}
