import type { DesktopWindowDescriptor } from "./types.js";

export function createDesktopWindowDescriptors(): DesktopWindowDescriptor[] {
  return [
    {
      id: "workspace",
      title: "主工作台",
      route: "/desktop/workspace",
      summary: "桌面主工作台，承载正文编辑、运行结果、时间线与一致性检查。",
    },
    {
      id: "mobile-console",
      title: "移动预览",
      route: "/desktop/mobile",
      summary: "在桌面端直接预览移动控制台页面，并保留统一导航。",
    },
    {
      id: "runs",
      title: "运行记录",
      route: "/desktop/runs",
      summary: "独立查看最近运行、通知与更新状态，便于调试与验收。",
    },
  ];
}

// 桌面端统一从本地 server 真实页面进入，不再加载 data-url 占位壳。
export function resolveDesktopWindowUrl(serverBaseUrl: string, descriptor: DesktopWindowDescriptor): string {
  if (descriptor.id === "workspace") {
    return `${serverBaseUrl}/`;
  }

  return `${serverBaseUrl}${descriptor.route}`;
}
