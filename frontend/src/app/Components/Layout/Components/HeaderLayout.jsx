"use client";
import { Avatar, Dropdown, Flex, Layout, Tooltip } from "antd";
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
  const isInIframe =
    typeof window !== "undefined" && window.self !== window.top;

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
  const header = (
    <Header>
      <Flex>
        <div className="logo">
          <Link className="logo-txt" href="/">
            {tHome("title")}
          </Link>
        </div>
        {isProfile ? (
          <>
            <span
              className="profile-link portal-header-placeholder"
              aria-hidden="true"
            >
              <Avatar icon={<UserOutlined />} />
              <span className="portal-header-profile-text" />
            </span>
            <span
              className="logout-link portal-header-placeholder"
              aria-hidden="true"
            >
              <LogoutOutlined />
            </span>
          </>
        ) : (
          <>
            <Dropdown menu={{ items }}>
              <Link className="profile-link" href="/#">
                <Avatar icon={<UserOutlined />} />{" "}
                {!isInIframe && (
                  <span className="portal-header-profile-name">{profile}</span>
                )}
              </Link>
            </Dropdown>
            <Tooltip title={tHome("logout")}>
              <Link
                className="logout-link"
                href="/api/v1/auth/logout"
                aria-label={tHome("logout")}
                onClick={clearMatrixSession}
              >
                <LogoutOutlined />
              </Link>
            </Tooltip>
          </>
        )}
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
