"use client";
import { useEffect, useState } from "react";
import { Card, List, Button, Badge, Empty, Flex, Spin, Dropdown } from "antd";
import {
  MessageOutlined,
  LoginOutlined,
  SettingOutlined,
  DeleteOutlined,
} from "@ant-design/icons";
import Link from "next/link";
import { useTranslations } from "@/i18n/TranslationsProvider";
import { useDashboard } from "@/app/Components/Context/DashboardContext";
import {
  runUnreadSync,
  startMatrixLogin,
  getMatrixSession,
  MATRIX_ELEMENT,
} from "@/lib/matrix";

// Dynamic chat widget: shows the user's unread Matrix channels live, via a
// long-poll /sync loop using the user's own session (obtained over OIDC SSO).
function Chat() {
  const t = useTranslations("Chat");
  const dashboard = useDashboard();
  // rooms: null = still loading; [] = connected, nothing unread.
  const [rooms, setRooms] = useState(null);
  const [connected, setConnected] = useState(() => !!getMatrixSession());

  useEffect(() => {
    if (!getMatrixSession()) return;
    const controller = new AbortController();
    runUnreadSync({ signal: controller.signal, onRooms: setRooms }).catch(
      (e) => {
        if (e.code === 401) setConnected(false);
      },
    );
    return () => controller.abort();
  }, []);

  let body;
  if (!connected) {
    body = (
      <Flex vertical align="center" gap="middle" style={{ padding: "16px 0" }}>
        <span>{t("connectPrompt")}</span>
        <Button
          type="primary"
          icon={<LoginOutlined />}
          onClick={startMatrixLogin}
        >
          {t("connect")}
        </Button>
      </Flex>
    );
  } else if (rooms === null) {
    body = (
      <Flex className="widget-loading" justify="center" align="center">
        <Spin size="large" />
      </Flex>
    );
  } else if (rooms.length === 0) {
    body = (
      <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t("noUnread")} />
    );
  } else {
    body = (
      <List
        size="small"
        split={false}
        dataSource={rooms}
        renderItem={(room) => (
          <List.Item>
            <Link
              href={room.url}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                flex: 1,
                minWidth: 0,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              <MessageOutlined /> {room.name || t("untitled")}
            </Link>
            <Badge
              count={room.unread}
              color={room.highlight > 0 ? "red" : undefined}
              overflowCount={99}
            />
          </List.Item>
        )}
      />
    );
  }

  const removeItem = dashboard && {
    key: "remove",
    danger: true,
    label: (
      <span onClick={() => dashboard.removeWidget("chat")}>
        <DeleteOutlined /> {t("remove")}
      </span>
    ),
  };

  return (
    <Card
      title={
        <Link href={MATRIX_ELEMENT} rel="noopener noreferrer" target="_blank">
          {t("title")}
        </Link>
      }
      extra={
        removeItem && (
          <Dropdown menu={{ items: [removeItem] }} trigger={["click"]}>
            <a onClick={(e) => e.preventDefault()}>
              <SettingOutlined />
            </a>
          </Dropdown>
        )
      }
    >
      {body}
    </Card>
  );
}

export default Chat;
