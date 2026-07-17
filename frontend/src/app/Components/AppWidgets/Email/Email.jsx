"use client";

import {
  Avatar,
  Badge,
  Button,
  Empty,
  List,
  Skeleton,
  Space,
  Typography,
} from "antd";
import { EditOutlined, InboxOutlined, MailOutlined } from "@ant-design/icons";
import Link from "next/link";
import moment from "moment";
import Widget from "@/app/Common/Widget";
import { useFetchWithRefresh } from "@/app/Common/CustomHooks/useFetchWithRefresh";
import { useTranslations } from "@/i18n/TranslationsProvider";

const { Text } = Typography;

function Email({ app, isAdmin }) {
  const t = useTranslations("Email");
  const {
    data: mail,
    loading,
    error,
    onRefresh,
  } = useFetchWithRefresh("/messages/widget");

  const baseUrl = app?.url?.replace(/\/$/, "") || "";
  const mailboxUrl = mail?.mailbox_id
    ? `${baseUrl}/mailbox/${mail.mailbox_id}`
    : baseUrl;
  const composeUrl = mail?.mailbox_id ? `${mailboxUrl}/new` : undefined;

  return (
    <Widget app={app} isAdmin={isAdmin} error={error} onRefresh={onRefresh}>
      <Space
        align="center"
        style={{
          display: "flex",
          justifyContent: "space-between",
          marginBottom: 12,
        }}
      >
        <Space>
          <Button
            type="primary"
            icon={<EditOutlined />}
            href={composeUrl}
            target="_blank"
            disabled={!composeUrl}
          >
            {t("compose")}
          </Button>
          <Button icon={<InboxOutlined />} href={mailboxUrl} target="_blank">
            {t("inbox")}
          </Button>
        </Space>
        <Space size={6}>
          <Text>{t("unread")}</Text>
          <Badge count={mail?.unread_count ?? 0} showZero overflowCount={99} />
        </Space>
      </Space>

      {loading ? (
        <Skeleton active={false} avatar paragraph={{ rows: 2 }} title={false} />
      ) : mail?.threads?.length ? (
        <List
          className="widget-list"
          dataSource={mail.threads}
          renderItem={(item) => (
            <List.Item key={item.id}>
              <List.Item.Meta
                avatar={<Avatar icon={<MailOutlined />} />}
                title={
                  <Link
                    href={`${mailboxUrl}/thread/${item.id}`}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    {item.subject || t("noSubject")}
                  </Link>
                }
                description={
                  <span>
                    {item.sender_names?.join(", ") || t("unknownSender")}
                    {item.messaged_at
                      ? ` · ${moment(item.messaged_at).format("DD-MM-YYYY, HH:mm")}`
                      : ""}
                  </span>
                }
              />
            </List.Item>
          )}
        />
      ) : (
        <Empty
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          description={t("noUnread")}
        />
      )}
    </Widget>
  );
}

export default Email;
