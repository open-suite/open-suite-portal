"use client";
import { Avatar, Dropdown, Flex, Layout, Tooltip } from "antd";
import { useSyncExternalStore } from "react";
import {
  LogoutOutlined,
  UserOutlined,
  BgColorsOutlined,
  ProfileOutlined,
  SettingOutlined,
} from "@ant-design/icons";
import Link from "next/link";
import { useTranslations } from "../../../../i18n/TranslationsProvider";
import { useTheme } from "../../Context/ThemeContext";
import { clearMatrixSession } from "@/lib/matrix";
const { Header } = Layout;
const subscribeToIframeState = () => () => {};

function HeaderLayout({
  isProfile = true,
  profile,
  redirectUrl,
  isAffixHeader = true,
  isAdmin = false,
}) {
  const tHome = useTranslations("HomePage");
  const tHeader = useTranslations("Header");
  const tNav = useTranslations("Navigation");
  const tTheme = useTranslations("Theme");
  const { theme, toggleTheme } = useTheme();
  const isInIframe = useSyncExternalStore(
    subscribeToIframeState,
    () => window.self !== window.top,
    () => false,
  );

  const items = [
    isAdmin && {
      key: "0",
      label: <Link href={"/admin"}>{tNav("admin")}</Link>,
      icon: <SettingOutlined />,
    },
    {
      key: "1",
      label: (
        <Link href={redirectUrl} rel="noopener noreferrer" target="_blank">
          {tHeader("myAccount")}
        </Link>
      ),
      icon: <ProfileOutlined />,
    },
    {
      key: "3",
      label: (
        <span onClick={toggleTheme}>
          {theme === "light" ? tTheme("dark") : tTheme("light")}
        </span>
      ),
      icon: <BgColorsOutlined />,
    },
  ].filter(Boolean); // Filter out falsey values (like the admin item when !isAdmin)
  const preventPendingNavigation = (event) => {
    if (isProfile) event.preventDefault();
  };
  const logout = (event) => {
    if (isProfile) {
      event.preventDefault();
      return;
    }
    clearMatrixSession();
  };
  const header = (
    <Header>
      <Flex>
        <div className="logo">
          <Link className="logo-txt" href="/">
            {tHome("title")}
          </Link>
        </div>
        <Dropdown disabled={isProfile} menu={{ items }}>
          <Link
            className={`profile-link${isProfile ? " portal-header-placeholder" : ""}`}
            href="/#"
            aria-disabled={isProfile || undefined}
            aria-label={profile || tHeader("myAccount")}
            onClick={preventPendingNavigation}
          >
            <Avatar icon={<UserOutlined />} />
            <span
              className={`portal-header-profile-name${isProfile ? " portal-header-profile-placeholder" : ""}${isInIframe ? " portal-header-profile-in-iframe" : ""}`}
              aria-hidden={isProfile || isInIframe || undefined}
            >
              {isProfile ? null : profile}
            </span>
          </Link>
        </Dropdown>
        <Tooltip title={tHome("logout")}>
          <Link
            className={`logout-link${isProfile ? " portal-header-placeholder" : ""}`}
            href="/api/v1/auth/logout"
            aria-disabled={isProfile || undefined}
            aria-label={tHome("logout")}
            onClick={logout}
            prefetch={false}
          >
            <LogoutOutlined />
          </Link>
        </Tooltip>
      </Flex>
    </Header>
  );

  return (
    <div className={isAffixHeader ? "portal-header-affix" : undefined}>
      {header}
    </div>
  );
}

export default HeaderLayout;
