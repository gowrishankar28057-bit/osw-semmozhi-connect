"use client";
import { useEffect, useRef, useState } from "react";
import { LoaderCircle, PhoneOff, RotateCcw } from "lucide-react";
import { api, ErrorBox } from "./common";
import { BrowserPresence } from "@/lib/browser-presence";
import type { MeetingConfig } from "@/lib/types";
type Jitsi = {
  addListener: (event: string, cb: (payload?: unknown) => void) => void;
  dispose: () => void;
  executeCommand: (command: string, ...args: unknown[]) => void;
};
declare global {
  interface Window {
    JitsiMeetExternalAPI: new (
      domain: string,
      options: Record<string, unknown>,
    ) => Jitsi;
  }
}
export type MeetingPhase = "loading" | "ready" | "joined" | "left" | "error";
const scripts = new Map<string, Promise<void>>();
function loadScript(src: string) {
  let pending = scripts.get(src);
  if (!pending) {
    pending = new Promise<void>((resolve, reject) => {
      const script = document.createElement("script");
      script.src = src;
      script.async = true;
      script.onload = () => resolve();
      script.onerror = () => {
        scripts.delete(src);
        script.remove();
        reject(
          new Error(
            "Unable to load the meeting. Check your internet connection and try again.",
          ),
        );
      };
      document.head.appendChild(script);
    });
    scripts.set(src, pending);
  }
  return pending;
}
/**
 * Real Jitsi conference embedded inside OSW via the Jitsi Meet External API.
 * In browser presence mode a participant's joins/leaves are reported to the
 * server, which stamps them with its own clock; the browser never sends time.
 */
export function JitsiMeeting({
  workshopId,
  participant,
  onPhase,
}: {
  workshopId: string;
  participant: boolean;
  onPhase?: (phase: MeetingPhase) => void;
}) {
  const container = useRef<HTMLDivElement>(null),
    api_ = useRef<Jitsi | undefined>(undefined),
    [error, setError] = useState(""),
    [phase, setPhase] = useState<MeetingPhase>("loading"),
    [attempt, setAttempt] = useState(0);
  useEffect(() => onPhase?.(phase), [phase, onPhase]);
  useEffect(() => {
    let disposed = false;
    let jitsi: Jitsi | undefined;
    let timer: ReturnType<typeof setInterval> | undefined;
    let joined = false;
    let reportPresence = false;
    const presence = new BrowserPresence(
      (action, connectionId) =>
        api(
          `workshops/${workshopId}/presence`,
          { action, connectionId },
          { keepalive: action === "leave" },
        ),
      (message) => {
        if (!disposed) setError(message);
      },
    );
    const leave = () => {
      if (!joined) return;
      joined = false;
      clearInterval(timer);
      if (reportPresence) presence.leave();
    };
    const resume = () => {
      if (document.visibilityState === "visible" && joined && reportPresence)
        presence.heartbeat();
    };
    const load = async () => {
      try {
        const config = await api<MeetingConfig>(
          `workshops/${workshopId}/meeting`,
        );
        reportPresence = participant && config.presenceMode === "browser";
        await loadScript(config.scriptUrl);
        if (disposed || !container.current) return;
        jitsi = new window.JitsiMeetExternalAPI(config.domain, {
          roomName: config.room,
          parentNode: container.current,
          width: "100%",
          height: "100%",
          jwt: config.jwt,
          userInfo: { displayName: config.displayName },
          configOverwrite: {
            prejoinConfig: { enabled: false },
            prejoinPageEnabled: false,
            disableDeepLinking: true,
            startWithAudioMuted: true,
            startWithVideoMuted: true,
            enableWelcomePage: false,
            enableClosePage: false,
            disableInviteFunctions: true,
            toolbarButtons: [
              "microphone",
              "camera",
              "desktop",
              "chat",
              "raisehand",
              "participants-pane",
              "tileview",
              "fullscreen",
              "settings",
              "hangup",
            ],
          },
          // Honoured by JaaS/self-hosted deployments; public servers may ignore it.
          interfaceConfigOverwrite: {
            SHOW_JITSI_WATERMARK: false,
            SHOW_WATERMARK_FOR_GUESTS: false,
            SHOW_BRAND_WATERMARK: false,
            SHOW_POWERED_BY: false,
            MOBILE_APP_PROMO: false,
            HIDE_INVITE_MORE_HEADER: true,
          },
        });
        api_.current = jitsi;
        jitsi.addListener("videoConferenceJoined", () => {
          if (disposed || joined) return;
          joined = true;
          setError("");
          setPhase("joined");
          if (reportPresence) {
            presence.join();
            timer = setInterval(() => presence.heartbeat(), 10_000);
          }
        });
        const left = () => {
          leave();
          if (!disposed) setPhase("left");
        };
        jitsi.addListener("videoConferenceLeft", left);
        jitsi.addListener("readyToClose", () => {
          left();
          jitsi?.dispose();
          jitsi = api_.current = undefined;
        });
        jitsi.addListener("errorOccurred", () => {
          if (!disposed)
            setError(
              "The meeting reported a connection problem. If the video stops, use Rejoin meeting.",
            );
        });
        setPhase("ready");
      } catch (e) {
        if (disposed) return;
        setPhase("error");
        setError(e instanceof Error ? e.message : "Meeting unavailable.");
      }
    };
    void load();
    window.addEventListener("pagehide", leave);
    document.addEventListener("visibilitychange", resume);
    return () => {
      disposed = true;
      leave();
      clearInterval(timer);
      jitsi?.dispose();
      api_.current = undefined;
      window.removeEventListener("pagehide", leave);
      document.removeEventListener("visibilitychange", resume);
    };
  }, [workshopId, participant, attempt]);
  const rejoin = () => {
    setError("");
    setPhase("loading");
    setAttempt((n) => n + 1);
  };
  return (
    <div className="jitsi-shell">
      <div
        ref={container}
        className={`jitsi-frame ${phase === "left" || phase === "error" ? "hidden" : ""}`}
      />
      {phase === "loading" && (
        <div className="stage-overlay" role="status">
          <LoaderCircle className="spin" size={30} />
          Joining workshop…
        </div>
      )}
      {(phase === "left" || phase === "error") && (
        <div className="stage-overlay">
          <p>
            {phase === "left"
              ? "You have left the meeting. Attendance recording has stopped."
              : "The meeting could not be opened."}
          </p>
          <button className="button gold" onClick={rejoin}>
            <RotateCcw size={17} />
            Rejoin meeting
          </button>
        </div>
      )}
      <div className="jitsi-toolbar">
        <ErrorBox message={error} />
        {(phase === "joined" || phase === "ready") && (
          <button
            className="button secondary small"
            onClick={() => api_.current?.executeCommand("hangup")}
          >
            <PhoneOff size={15} />
            Leave meeting
          </button>
        )}
      </div>
    </div>
  );
}
