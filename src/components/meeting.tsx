"use client";
import { useEffect, useRef, useState } from "react";
import { api, ErrorBox } from "./common";
type Config = {
  room: string;
  domain: string;
  jwt?: string;
  displayName: string;
  sessionId: string;
  presenceMode: string;
};
type Jitsi = {
  addListener: (event: string, cb: () => void) => void;
  dispose: () => void;
  executeCommand: (command: string) => void;
};
declare global {
  interface Window {
    JitsiMeetExternalAPI: new (
      domain: string,
      options: Record<string, unknown>,
    ) => Jitsi;
  }
}
export function Meeting({
  workshopId,
  participant,
  onClose,
}: {
  workshopId: string;
  participant: boolean;
  onClose: () => void;
}) {
  const container = useRef<HTMLDivElement>(null),
    [error, setError] = useState(""),
    [status, setStatus] = useState("Loading meeting…");
  useEffect(() => {
    let disposed = false;
    let jitsi: Jitsi | undefined;
    let timer: ReturnType<typeof setInterval> | undefined;
    let joined = false;
    let heartbeatBusy = false;
    const connectionId = crypto.randomUUID();
    const presence = async (action: "join" | "heartbeat" | "leave") => {
      if (!participant) return;
      try {
        await api(`workshops/${workshopId}/presence`, { action, connectionId });
        setError("");
      } catch (e) {
        setError(
          e instanceof Error ? e.message : "Attendance connection failed.",
        );
      }
    };
    const leave = () => {
      if (!joined) return;
      joined = false;
      clearInterval(timer);
      if (participant)
        void fetch(`/api/workshops/${workshopId}/presence`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "leave", connectionId }),
          keepalive: true,
        });
      setStatus("You have left the meeting.");
    };
    const load = async () => {
      try {
        const config = await api<Config>(`workshops/${workshopId}/meeting`);
        await new Promise<void>((resolve, reject) => {
          const script = document.createElement("script");
          script.src = `https://${config.domain}/external_api.js`;
          script.async = true;
          script.onload = () => resolve();
          script.onerror = () =>
            reject(
              new Error(
                "Unable to load Jitsi. Check your internet connection.",
              ),
            );
          document.head.appendChild(script);
        });
        if (disposed || !container.current) return;
        jitsi = new window.JitsiMeetExternalAPI(config.domain, {
          roomName: config.room,
          parentNode: container.current,
          width: "100%",
          height: 560,
          jwt: config.jwt,
          userInfo: { displayName: config.displayName },
          configOverwrite: {
            prejoinConfig: { enabled: true },
            disableDeepLinking: true,
            startWithAudioMuted: true,
            startWithVideoMuted: true,
          },
        });
        jitsi.addListener("videoConferenceJoined", () => {
          if (disposed) return;
          joined = true;
          setStatus("Connected to workshop");
          void presence("join");
          timer = setInterval(async () => {
            if (!joined || heartbeatBusy) return;
            heartbeatBusy = true;
            await presence("heartbeat");
            heartbeatBusy = false;
          }, 10_000);
        });
        jitsi.addListener("videoConferenceLeft", leave);
        jitsi.addListener("readyToClose", leave);
        jitsi.addListener("errorOccurred", () =>
          setError(
            "The meeting reported an error. Check the meeting panel and reconnect if needed.",
          ),
        );
        setStatus("Join the meeting below to begin attendance tracking.");
      } catch (e) {
        setError(e instanceof Error ? e.message : "Meeting unavailable.");
      }
    };
    void load();
    window.addEventListener("pagehide", leave);
    return () => {
      disposed = true;
      leave();
      clearInterval(timer);
      jitsi?.dispose();
      window.removeEventListener("pagehide", leave);
    };
  }, [workshopId, participant]);
  return (
    <section className="panel meeting-panel">
      <div className="panel-heading">
        <h2>OSW live workshop</h2>
        <button className="button secondary small" onClick={onClose}>
          Leave & close
        </button>
      </div>
      <p className="meeting-status" role="status">
        {status}
      </p>
      <ErrorBox message={error} />
      <div ref={container} className="meeting-container" />
      <p className="fine">
        Allow camera and microphone access when prompted. Attendance starts
        after Jitsi confirms you joined. The organizer may need to sign in to
        Jitsi to open the room.
      </p>
    </section>
  );
}
