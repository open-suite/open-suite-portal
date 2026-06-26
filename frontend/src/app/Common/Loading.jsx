import { Spin } from "antd";

function Loading() {
  return (
    <div className="loading-space-up">
      <Spin size="large" />
    </div>
  );
}

export default Loading;
