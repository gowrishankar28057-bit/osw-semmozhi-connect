"use client";
import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  GraduationCap,
  Users,
  ShieldCheck,
  ArrowRight,
  Eye,
  EyeOff,
} from "lucide-react";
import { api, ErrorBox } from "./common";
import type { Role } from "@/lib/types";
export function AuthForm({
  register = false,
  next = "",
}: {
  register?: boolean;
  next?: string;
}) {
  const [role, setRole] = useState<Role>("PARTICIPANT"),
    [show, setShow] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const router = useRouter();
  const safeNext =
    next.startsWith("/") && !next.startsWith("//") && !next.includes("\\")
      ? next
      : "";
  return (
    <main className="auth-page">
      <div className="institute">
        <span className="institute-mark">செ</span>
        <div>
          CENTRAL INSTITUTE
          <br />
          OF CLASSICAL TAMIL<small>செம்மொழித் தமிழாய்வு மத்திய நிறுவனம்</small>
        </div>
      </div>
      <section className="auth-box">
        <div className="auth-art">
          <Image
            src="/assets/auth-heritage.png"
            alt="OSW Semmozhi Connect, Tamil temple heritage"
            fill
            priority
            sizes="(max-width: 800px) 100vw, 48vw"
          />
        </div>
        <div className="auth-form">
          <p className="eyebrow">SEMMOZHI CONNECT</p>
          <h1>
            {register
              ? "Begin your learning journey"
              : "Access Your OSW Portal"}
          </h1>
          <p className="subtle">
            {register
              ? "Create your participant account"
              : "Choose your role to continue"}
          </p>
          {!register && (
            <div className="role-tabs" role="group" aria-label="Account role">
              {(
                [
                  ["PARTICIPANT", "Participant", GraduationCap],
                  ["ORGANIZER", "Organizer", Users],
                  ["ADMIN", "Admin", ShieldCheck],
                ] as const
              ).map(([v, label, Icon]) => (
                <button
                  key={v}
                  className={role === v ? "selected" : ""}
                  aria-pressed={role === v}
                  onClick={() => setRole(v)}
                  type="button"
                >
                  <Icon size={23} />
                  {label}
                </button>
              ))}
            </div>
          )}
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              setBusy(true);
              setError("");
              const fd = new FormData(e.currentTarget);
              try {
                const user = await api<{ role: Role }>(
                  `auth/${register ? "register" : "login"}`,
                  {
                    email: fd.get("email"),
                    password: fd.get("password"),
                    role: register ? "PARTICIPANT" : role,
                    ...(register
                      ? {
                          name: fd.get("name"),
                          department: fd.get("department"),
                        }
                      : {}),
                  },
                );
                router.push(safeNext || `/${user.role.toLowerCase()}`);
                router.refresh();
              } catch (err) {
                setError(
                  err instanceof Error ? err.message : "Unable to sign in.",
                );
              } finally {
                setBusy(false);
              }
            }}
          >
            {register && (
              <>
                <label>
                  Full name
                  <input
                    name="name"
                    autoComplete="name"
                    required
                    minLength={2}
                    maxLength={100}
                  />
                </label>
                <label>
                  Institution / department
                  <input
                    name="department"
                    autoComplete="organization"
                    maxLength={120}
                  />
                </label>
              </>
            )}
            <label>
              Email address
              <input
                name="email"
                type="email"
                autoComplete="email"
                placeholder="you@institution.edu"
                required
              />
            </label>
            <label>
              Password
              <div className="password-field">
                <input
                  name="password"
                  type={show ? "text" : "password"}
                  autoComplete={register ? "new-password" : "current-password"}
                  minLength={8}
                  maxLength={72}
                  required
                  placeholder="Enter your password"
                />
                <button
                  type="button"
                  aria-label={show ? "Hide password" : "Show password"}
                  onClick={() => setShow(!show)}
                >
                  {show ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </label>
            <ErrorBox message={error} />
            <button className="button full" disabled={busy}>
              {busy ? "Please wait…" : register ? "Create account" : "Login"}
              <ArrowRight size={18} />
            </button>
          </form>
          <p className="auth-switch">
            {register ? "Already have an account?" : "New to OSW?"}{" "}
            <Link
              href={`${register ? "/login" : "/register"}${safeNext ? `?next=${encodeURIComponent(safeNext)}` : ""}`}
            >
              {register ? "Sign in" : "Create participant account"}
            </Link>
          </p>
          <div className="auth-note">
            <ShieldCheck size={26} />
            <div>
              Role-based access for your learning journey
              <small>Organizer accounts are created by an administrator.</small>
            </div>
          </div>
          <p className="fine">
            For account access assistance, contact your institute administrator.
          </p>
        </div>
      </section>
      <p className="auth-footer">A knowledge society for a brighter tomorrow</p>
    </main>
  );
}
