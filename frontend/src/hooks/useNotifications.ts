import { useEffect } from "react";
import { toast } from "sonner";

type NotificationItem = {
  message: string;
  duration?: number;
};

type NotificationsResponse = {
  notifications?: NotificationItem[];
};

export default function useNotifications(userType: string) {
  useEffect(() => {
    if (!userType) return;

    const poll = () => {
      fetch("/api/notifications/poll/")
        .then((res) => res.json() as Promise<NotificationsResponse>)
        .then((data) => {
          const notifications = data.notifications || [];

          notifications.forEach((notification: NotificationItem) => {
            toast(notification.message, {
              description: "Please refresh your Applications' page to see updates",
              duration: notification.duration || 30000,
              action: {
                label: "OK",
                onClick: () => console.log("dismissed"),
              },
            });
          });
        })
        .catch((err: unknown) => {
          console.error("Notification poll failed:", err);
        });
    };

    poll();
    const interval = setInterval(poll, 5000);

    return () => clearInterval(interval);
  }, [userType]);
}