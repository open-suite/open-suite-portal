"use client";
import { Avatar } from "antd";
import { ProjectOutlined } from "@ant-design/icons";
import Widget from "@/app/Common/Widget";
import CustomList from "@/app/Common/CustomList";
import { useFetchWithRefresh } from "@/app/Common/CustomHooks/useFetchWithRefresh";

function Projects({ app }) {
  const { data, loading, error, onRefresh } =
    useFetchWithRefresh("/ocs/projects");
  const projects = (data || []).slice(0, 3);

  return (
    <Widget app={app} error={error} onRefresh={onRefresh}>
      <CustomList
        className="widget-list"
        dataSource={projects}
        loading={loading}
        renderItem={(project) => (
          <CustomList.Item key={project.id}>
            <CustomList.Item.Meta
              avatar={
                <Avatar
                  icon={<ProjectOutlined />}
                  style={{
                    backgroundColor: project.color
                      ? `#${project.color.replace(/^#/, "")}`
                      : "#8c8c8c",
                  }}
                />
              }
              title={
                <a
                  href={project.link}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {project.title}
                </a>
              }
              description={`${project.completed_count} of ${project.card_count} cards done`}
            />
          </CustomList.Item>
        )}
      />
    </Widget>
  );
}

export default Projects;
