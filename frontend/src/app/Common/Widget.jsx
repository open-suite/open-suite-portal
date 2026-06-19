"use client";
import {
  ReloadOutlined,
  ArrowRightOutlined,
  SettingOutlined,
  DeleteOutlined,
} from "@ant-design/icons";
import { Card, Divider, Result, Input, Dropdown, Space } from "antd";
import React, { useState } from "react";
import { useTranslations } from "../../i18n/TranslationsProvider";
import { useDashboard } from "../Components/Context/DashboardContext";
import Link from "next/link";
const { Search } = Input;

function Widget({
  children,
  error,
  loading = false,
  setSearch = undefined,
  placeholder = "",
  onRefresh = undefined,
  app,
  isAdmin = false,
}) {
  const t = useTranslations("Widget");
  const dashboard = useDashboard();
  const [value, setValue] = useState("");
  const { iframe, url, title, id } = app || {};
  const iconLink = (title) =>
    iframe && id ? (
      <Link href={`/${id}`}>{title}</Link>
    ) : (
      <Link href={url || ""} rel="noopener noreferrer" target="_blank">
        {title}
      </Link>
    );

  const items = [
    isAdmin && {
      label: (
        <Link
          href={id === "ocs" ? `${url}/settings/admin` : `${url}/admin` || ""}
          rel="noopener noreferrer"
          target="_blank"
        >
          <ArrowRightOutlined /> {title} {t("admin")}
        </Link>
      ),
      key: "0",
    },
    onRefresh && {
      label: (
        <Link onClick={onRefresh} href="#">
          <ReloadOutlined /> {t("refresh")}
        </Link>
      ),
      key: "1",
    },
    dashboard &&
      id && {
        label: (
          <span onClick={() => dashboard.removeWidget(id)}>
            <DeleteOutlined /> {t("remove")}
          </span>
        ),
        key: "remove",
        danger: true,
      },
  ];

  return (
    <Card
      title={<span>{iconLink(title)}</span>}
      loading={loading}
      extra={
        items.filter(Boolean).length > 0 && (
          <Dropdown menu={{ items: items.filter(Boolean) }} trigger={["click"]}>
            <a onClick={(e) => e.preventDefault()}>
              <Space>
                <SettingOutlined />
              </Space>
            </a>
          </Dropdown>
        )
      }
    >
      {error ? (
        <Result status="warning" title={error} className="space-min-up" />
      ) : (
        <React.Fragment>
          {setSearch && (
            <React.Fragment>
              <Search
                placeholder={placeholder || `${title} ${t("search")}`}
                onSearch={(t) => setSearch(t)}
                onChange={(e) => setValue(e.target.value)}
                value={value}
                allowClear
                className="widget-search"
              />
              <Divider />
            </React.Fragment>
          )}

          {children}
        </React.Fragment>
      )}
    </Card>
  );
}

export default Widget;
