"use client";
import React from "react";
import { Spin, Flex, Typography, Empty } from "antd";
import { useTranslations } from "@/i18n/TranslationsProvider";

const { Text } = Typography;

const CustomList = ({
  className = "",
  dataSource = [],
  loading = false,
  renderItem,
  search = "",
  ...restProps
}) => {
  const t = useTranslations("List");
  if (dataSource?.length <= 0 && loading) {
    return (
      <Flex
        justify="center"
        align="center"
        className={`custom-list custom-list-loading ${className}`}
      >
        <Spin size="large" />
      </Flex>
    );
  }
  return (
    <div className={`custom-list ${className}`} {...restProps}>
      {dataSource.map((item, index) => {
        const renderedItem = renderItem(item, index);
        return renderedItem;
      })}
      {dataSource?.length === 0 && !loading && (
        <Empty description={search ? t("empty") : t("emptyData")} />
      )}
    </div>
  );
};

const CustomListItem = ({ children, className = "", ...props }) => {
  return (
    <Flex
      className={`custom-list-item ${className}`}
      align="center"
      justify="space-between"
      {...props}
    >
      {children}
    </Flex>
  );
};

const CustomListItemMeta = ({ avatar, title, description, className = "" }) => {
  return (
    <Flex
      className={`custom-list-item-meta ${className}`}
      align="center"
      gap="small"
      style={{ flex: 1, minWidth: 0, overflow: "hidden" }}
    >
      {avatar && <Flex className="custom-list-item-meta-avatar">{avatar}</Flex>}
      {title && (
        <Text
          strong
          className="custom-list-item-meta-title"
          style={{
            flex: 1,
            minWidth: 0,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {title}
        </Text>
      )}
      {description && (
        <Text
          type="secondary"
          className="custom-list-item-meta-description"
          style={{ flexShrink: 0, whiteSpace: "nowrap" }}
        >
          {description}
        </Text>
      )}
    </Flex>
  );
};

CustomList.Item = CustomListItem;
CustomList.Item.Meta = CustomListItemMeta;

export default CustomList;
