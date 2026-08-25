import { useEffect } from "react";
import OBR from "@owlbear-rodeo/sdk";
import { NOTIFICATION_POPOVER_ID } from "../constants";

export function useAutoHeight(isNotificationPopover: boolean) {
  useEffect(() => {
    if (!OBR.isAvailable) return;
    let active = true;
    let frame = 0;
    let previousHeight = 0;
    let observer: ResizeObserver | undefined;

    OBR.onReady(() => {
      if (!active) return;
      const root = document.getElementById("root");
      if (!root) return;
      const resize = () => {
        window.cancelAnimationFrame(frame);
        frame = window.requestAnimationFrame(() => {
          const height = Math.max(1, Math.ceil(root.getBoundingClientRect().height));
          if (!active || height === previousHeight) return;
          previousHeight = height;
          if (isNotificationPopover) void OBR.popover.setHeight(NOTIFICATION_POPOVER_ID, height).catch(() => undefined);
          else void OBR.action.setHeight(height).catch(() => undefined);
        });
      };
      observer = new ResizeObserver(resize);
      observer.observe(root);
      resize();
    });

    return () => {
      active = false;
      observer?.disconnect();
      window.cancelAnimationFrame(frame);
    };
  }, [isNotificationPopover]);
}
