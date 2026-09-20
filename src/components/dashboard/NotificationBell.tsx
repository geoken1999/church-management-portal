"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { Bell, UserPlus, X } from "lucide-react";
import {
  getNotificationsForOrg,
  markNotificationRead,
  markAllNotificationsRead,
  deleteNotification,
  clearAllNotifications,
} from "@/lib/notifications/actions";
import type { Notification } from "@/types/database";
import { Button } from "@/components/ui/button";
import { Popover, PopoverTrigger, PopoverContent, PopoverTitle, PopoverDescription } from "@/components/ui/popover";

const POLL_INTERVAL_MS = 20000;

function relativeTime(iso: string): string {
  const minutes = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export function NotificationBell({
  organizationId,
  initialNotifications,
}: {
  organizationId: string;
  initialNotifications: Notification[];
}) {
  const [notifications, setNotifications] = useState(initialNotifications);
  const [, startTransition] = useTransition();

  useEffect(() => {
    const interval = setInterval(() => {
      getNotificationsForOrg(organizationId).then(setNotifications);
    }, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [organizationId]);

  const unreadCount = notifications.filter((n) => !n.read_at).length;

  function handleOpen(notification: Notification) {
    if (notification.read_at) return;
    setNotifications((prev) =>
      prev.map((n) => (n.id === notification.id ? { ...n, read_at: new Date().toISOString() } : n)),
    );
    startTransition(() => {
      markNotificationRead(notification.id);
    });
  }

  function handleMarkAllRead() {
    setNotifications((prev) => prev.map((n) => (n.read_at ? n : { ...n, read_at: new Date().toISOString() })));
    startTransition(() => {
      markAllNotificationsRead(organizationId);
    });
  }

  function handleClear(notificationId: string) {
    setNotifications((prev) => prev.filter((n) => n.id !== notificationId));
    startTransition(() => {
      deleteNotification(notificationId);
    });
  }

  function handleClearAll() {
    setNotifications([]);
    startTransition(() => {
      clearAllNotifications(organizationId);
    });
  }

  return (
    <Popover>
      <PopoverTrigger
        render={
          <Button type="button" variant="ghost" size="icon" aria-label="Notifications">
            <span className="relative inline-flex">
              <Bell className="size-4.5" />
              {unreadCount > 0 && (
                <span className="absolute -top-1 -right-1 flex size-3.5 items-center justify-center rounded-full bg-primary text-[9px] font-medium text-primary-foreground">
                  {unreadCount > 9 ? "9+" : unreadCount}
                </span>
              )}
            </span>
          </Button>
        }
      />
      <PopoverContent align="end" className="w-80">
        <div className="mb-1 flex items-start justify-between gap-2">
          <div>
            <PopoverTitle>Notifications</PopoverTitle>
            <PopoverDescription>New join requests show up here.</PopoverDescription>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            {notifications.length > 0 && (
              <>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={handleMarkAllRead}
                  disabled={unreadCount === 0}
                >
                  Mark all read
                </Button>
                <Button type="button" variant="ghost" size="sm" onClick={handleClearAll}>
                  Clear all
                </Button>
              </>
            )}
          </div>
        </div>
        <div className="flex max-h-80 flex-col gap-1 overflow-y-auto">
          {notifications.length === 0 && (
            <p className="px-1.5 py-4 text-center text-sm text-muted-foreground">No notifications yet.</p>
          )}
          {notifications.map((notification) => (
            <div
              key={notification.id}
              className={`group flex items-start gap-1 rounded-lg px-1.5 py-2 transition-colors hover:bg-accent ${
                notification.read_at ? "" : "bg-accent/50"
              }`}
            >
              <Link
                href={notification.link ?? "/dashboard"}
                onClick={() => handleOpen(notification)}
                className="flex min-w-0 flex-1 items-start gap-2.5"
              >
                <div className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full bg-accent text-accent-foreground">
                  <UserPlus className="size-3.5" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">{notification.title}</p>
                  {notification.body && <p className="text-xs text-muted-foreground">{notification.body}</p>}
                  <p className="mt-0.5 text-xs text-muted-foreground">{relativeTime(notification.created_at)}</p>
                </div>
                {!notification.read_at && <span className="mt-1.5 size-2 shrink-0 rounded-full bg-primary" />}
              </Link>
              <button
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  handleClear(notification.id);
                }}
                className="mt-0.5 shrink-0 rounded p-1 text-muted-foreground opacity-0 transition-opacity hover:bg-muted hover:text-foreground focus-visible:opacity-100 group-hover:opacity-100"
                aria-label="Clear notification"
              >
                <X className="size-3.5" />
              </button>
            </div>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
