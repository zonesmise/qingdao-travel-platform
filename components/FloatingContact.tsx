"use client";
/* eslint-disable @next/next/no-img-element */

import { useEffect, useMemo, useRef, useState, type MouseEvent } from "react";
import { siKakaotalk, siLine, siTelegram } from "simple-icons";

type FloatingContactProps = {
  settings: Record<string, string>;
};

function safeContactUrl(value: string | undefined) {
  const url = String(value || "").trim();
  if (!url) return "";
  if (url.startsWith("/") && !url.startsWith("//")) return url;
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" || parsed.protocol === "http:" ? parsed.toString() : "";
  } catch {
    return "";
  }
}

const SEOUL_TIME_ZONE = "Asia/Seoul";

function BrandLogo({ path }: { path: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d={path} />
    </svg>
  );
}

function timeToMinutes(value: string | undefined, fallback: string) {
  const match = String(value || fallback).match(/^(\d{2}):(\d{2})$/);
  if (!match) return timeToMinutes(fallback, "00:00");
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  return hour >= 0 && hour < 24 && minute >= 0 && minute < 60
    ? hour * 60 + minute
    : timeToMinutes(fallback, "00:00");
}

function seoulClock(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: SEOUL_TIME_ZONE,
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === type)?.value || "";
  const day = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(part("weekday"));
  return { day: Math.max(0, day), minutes: Number(part("hour")) * 60 + Number(part("minute")) };
}

export function isContactAvailable(settings: Record<string, string>, now = new Date()) {
  if (settings.contact_always_available === "true") return true;
  const { day, minutes } = seoulClock(now);
  const selectedDays = new Set(
    String(settings.contact_weekdays || "1,2,3,4,5")
      .split(",")
      .map((value) => Number(value.trim()))
      .filter((value) => Number.isInteger(value) && value >= 0 && value <= 6),
  );
  const start = timeToMinutes(settings.contact_start_time, "09:00");
  const end = timeToMinutes(settings.contact_end_time, "18:00");
  if (start === end) return selectedDays.has(day);
  if (start < end) return selectedDays.has(day) && minutes >= start && minutes < end;
  const previousDay = (day + 6) % 7;
  return (selectedDays.has(day) && minutes >= start) || (selectedDays.has(previousDay) && minutes < end);
}

export default function FloatingContact({ settings }: FloatingContactProps) {
  const initiallyAvailable = isContactAvailable(settings);
  const [available, setAvailable] = useState(initiallyAvailable);
  const [open, setOpen] = useState(initiallyAvailable && settings.contact_default_open !== "false");
  const [unavailableNotice, setUnavailableNotice] = useState(false);
  const availabilityRef = useRef(initiallyAvailable);
  const noticeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const launcherRef = useRef<HTMLButtonElement>(null);
  const availabilitySettings = useMemo(() => ({
    contact_always_available: settings.contact_always_available,
    contact_weekdays: settings.contact_weekdays,
    contact_start_time: settings.contact_start_time,
    contact_end_time: settings.contact_end_time,
    contact_default_open: settings.contact_default_open,
  }), [
    settings.contact_always_available,
    settings.contact_weekdays,
    settings.contact_start_time,
    settings.contact_end_time,
    settings.contact_default_open,
  ]);

  useEffect(() => {
    const refreshAvailability = () => {
      const next = isContactAvailable(availabilitySettings);
      const previous = availabilityRef.current;
      availabilityRef.current = next;
      setAvailable(next);
      if (!next) setOpen(false);
      if (!previous && next && availabilitySettings.contact_default_open !== "false") setOpen(true);
    };
    refreshAvailability();
    const timer = window.setInterval(refreshAvailability, 30_000);
    return () => window.clearInterval(timer);
  }, [availabilitySettings]);

  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      window.removeEventListener("keydown", closeOnEscape);
      if (noticeTimerRef.current) clearTimeout(noticeTimerRef.current);
    };
  }, []);

  function toggleContact() {
    if (!available) {
      setUnavailableNotice(true);
      if (noticeTimerRef.current) clearTimeout(noticeTimerRef.current);
      noticeTimerRef.current = setTimeout(() => setUnavailableNotice(false), 2600);
      return;
    }
    setUnavailableNotice(false);
    setOpen((current) => !current);
  }

  function openContactChannel(
    event: MouseEvent<HTMLAnchorElement>,
    channel: { key: string; url: string },
  ) {
    const mobile = window.matchMedia("(max-width: 720px), (pointer: coarse)").matches;
    if (mobile) return;

    event.preventDefault();
    const popupWidth = Math.min(500, Math.max(380, window.screen.availWidth - 96));
    const popupHeight = Math.min(720, Math.max(560, window.screen.availHeight - 96));
    const left = Math.max(0, Math.round(window.screenX + (window.outerWidth - popupWidth) / 2));
    const top = Math.max(0, Math.round(window.screenY + (window.outerHeight - popupHeight) / 2));
    const popup = window.open(
      channel.url,
      "rewardConsultPopup",
      `popup=yes,width=${popupWidth},height=${popupHeight},left=${left},top=${top},resizable=yes,scrollbars=yes`,
    );

    if (popup) {
      try {
        popup.opener = null;
      } catch {
        // The popup can still be used if the browser protects this property.
      }
      popup.focus();
      return;
    }

    window.location.assign(channel.url);
  }

  if (settings.contact_floating_enabled === "false") return null;

  const channels = [
    {
      key: "kakao",
      label: "카카오톡 상담",
      line1: "카카오톡",
      line2: "상담",
      url: safeContactUrl(settings.contact_kakao_url),
      enabled: settings.contact_kakao_enabled !== "false",
      icon: <BrandLogo path={siKakaotalk.path} />,
    },
    {
      key: "telegram",
      label: "텔레그램상담",
      line1: "텔레그램",
      line2: "상담",
      url: safeContactUrl(settings.contact_telegram_url),
      enabled: settings.contact_telegram_enabled !== "false",
      icon: <BrandLogo path={siTelegram.path} />,
    },
    {
      key: "line",
      label: "라인상담",
      line1: "라인",
      line2: "상담",
      url: safeContactUrl(settings.contact_line_url),
      enabled: settings.contact_line_enabled !== "false",
      icon: <BrandLogo path={siLine.path} />,
    },
    {
      key: "live",
      label: "실시간상담",
      line1: "실시간",
      line2: "상담",
      url: safeContactUrl(settings.contact_live_url),
      enabled: settings.contact_live_enabled !== "false",
      icon: "···",
    },
  ].filter((channel) => channel.enabled && channel.url);

  if (!channels.length) return null;

  return (
    <aside className={`floating-contact ${open ? "is-open" : "is-closed"} ${available ? "is-available" : "is-unavailable"}`} aria-label="빠른 상담">
      {open && (
        <div className="floating-contact-backdrop">
          <div
            className="floating-contact-panel"
            id="floating-contact-panel"
            role="region"
            aria-labelledby="floating-contact-title"
          >
            <span className="contact-sheet-handle" aria-hidden="true" />
            <header>
              <span className="contact-counselor" aria-hidden="true">
                {settings.contact_counselor_image_url ? (
                  <img src={settings.contact_counselor_image_url} alt="" />
                ) : (
                  <b>CS</b>
                )}
              </span>
              <div className="contact-header-copy">
                <strong id="floating-contact-title">
                  <span className="contact-availability-light" aria-hidden="true" />
                  {available ? "상담 가능" : "상담 종료"}
                </strong>
                <small>{settings.contact_counselor_name || "편하게 문의하세요"}</small>
              </div>
            </header>
            <nav aria-label="상담 채널">
              {channels.map((channel) => {
                const external = !channel.url.startsWith("/");
                return (
                  <a
                    key={channel.key}
                    className={`contact-channel contact-${channel.key}`}
                    href={channel.url}
                    target={external ? "_blank" : undefined}
                    rel={external ? "noreferrer" : undefined}
                    onClick={(event) => openContactChannel(event, channel)}
                    aria-label={channel.label}
                  >
                    <span aria-hidden="true">{channel.icon}</span>
                    <strong><span>{channel.line1}</span><small>{channel.line2}</small></strong>
                    <b aria-hidden="true">›</b>
                  </a>
                );
              })}
            </nav>
          </div>
        </div>
      )}
      {unavailableNotice && (
        <div className="contact-unavailable-notice" role="status">현재 상담시간이 아닙니다</div>
      )}
      <button
        ref={launcherRef}
        type="button"
        className="floating-contact-button"
        onClick={toggleContact}
        aria-controls="floating-contact-panel"
        aria-expanded={open}
        aria-label={open ? "상담 메뉴 접기" : available ? "상담 메뉴 열기" : "현재 상담시간 아님"}
      >
        {open ? (
          <><span className="contact-close-mark" aria-hidden="true">×</span><strong>닫기</strong></>
        ) : (
          <><span className="contact-status-lamp" aria-hidden="true" /><strong>{available ? "상담" : "종료"}</strong></>
        )}
      </button>
    </aside>
  );
}
