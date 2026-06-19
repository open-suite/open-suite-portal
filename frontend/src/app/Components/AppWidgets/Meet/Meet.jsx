"use client";
import { useState } from "react";
import { Avatar, Button, Tooltip } from "antd";
import {
  GlobalOutlined,
  LockOutlined,
  PhoneOutlined,
  TeamOutlined,
  VideoCameraOutlined,
} from "@ant-design/icons";
import Widget from "@/app/Common/Widget";
import { useFetchWithRefresh } from "@/app/Common/CustomHooks/useFetchWithRefresh";
import Link from "next/link";
import { useTranslations } from "@/i18n/TranslationsProvider";
import CustomList from "@/app/Common/CustomList";
import api from "@/lib/axios";

const ACCESS_LEVEL_ICON = {
  public: <GlobalOutlined />,
  trusted: <TeamOutlined />,
  restricted: <LockOutlined />,
};

// meet
function Meet({ app }) {
  // TODO search functionality is implemented in the frontend only because Meet dose not support search
  const search = "";
  const [page, setPage] = useState(1);
  const [starting, setStarting] = useState(false);
  const t = useTranslations("Meet");
  const { data: meet, error, onRefresh } = useFetchWithRefresh("/meet/rooms");

  // Custom Pagination because meet dose not support pagination correctly
  const paginatedMeet = meet?.results?.slice((page - 1) * 3, page * 3) ?? [];

  const startMeeting = async () => {
    if (starting) return;
    setStarting(true);
    // Open the tab synchronously so the browser keeps it tied to the click and
    // does not block it as a popup; redirect once the room URL comes back.
    // NB: do not pass "noopener" here — that makes window.open return null, so
    // we'd lose the handle and be left with a blank tab.
    const win = window.open("about:blank", "_blank");
    try {
      const { data: room } = await api.post("/meet/rooms");
      if (!room?.url) throw new Error("No room URL returned");
      if (win) {
        win.opener = null; // sever opener after we have the handle
        win.location.href = room.url;
      } else {
        window.open(room.url, "_blank", "noopener,noreferrer");
      }
      onRefresh?.();
    } catch {
      win?.close();
    } finally {
      setStarting(false);
    }
  };

  return (
    <Widget
      app={app}
      error={error}
      onRefresh={onRefresh}
      page={page}
      setPage={setPage}
      total={meet?.count || 0}
    >
      <Button
        type="primary"
        block
        icon={<VideoCameraOutlined />}
        loading={starting}
        onClick={startMeeting}
        style={{ marginBottom: 12 }}
      >
        {t("startMeeting")}
      </Button>
      <CustomList
        className="widget-list"
        dataSource={
          paginatedMeet?.filter((value) =>
            value?.name?.toUpperCase()?.includes(search.toUpperCase()),
          ) || []
        }
        search={search}
        // loading={loading}
        renderItem={(item) => (
          <CustomList.Item key={item.slug}>
            <CustomList.Item.Meta
              avatar={<Avatar className="avt-name" icon={<PhoneOutlined />} />}
              title={
                <Link href={item.url} target="_blank" rel="noopener noreferrer">
                  {item.name}
                </Link>
              }
              description={
                item.access_level ? (
                  <span className="custom-list-text">
                    {t("accessLevel")}:
                    <Tooltip title={t(item.access_level)}>
                      <span className="access-level-icon">
                        {ACCESS_LEVEL_ICON[item.access_level]}
                      </span>
                    </Tooltip>
                  </span>
                ) : null
              }
            />
          </CustomList.Item>
        )}
      />
    </Widget>
  );
}

export default Meet;
