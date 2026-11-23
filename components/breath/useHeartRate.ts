"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { parseHeartRate, type HrPacket } from "@/lib/breath/hr";

// Live heart rate from any standard Bluetooth heart-rate sensor: a Garmin watch with "Broadcast Heart Rate" on,
// a chest strap, or an armband. Two ways in:
//  - Web Bluetooth, in browsers that have it (Chrome on Android, Chrome/Edge on a computer).
//  - The iPhone app, once its build says it can (window.__diastoleCaps includes "hr"): the page asks with
//    {type: "hrStart"} and the app sends 'diastole:hr' events. App builds without it never show the button.

export type HrStatus = "idle" | "connecting" | "live" | "lost" | "error";
type Source = "web" | "native" | null;

type BtChar = EventTarget & { value?: DataView; startNotifications: () => Promise<unknown>; stopNotifications: () => Promise<unknown> };
type BtDevice = EventTarget & { name?: string; gatt?: { connected: boolean; connect: () => Promise<{ getPrimaryService: (s: string) => Promise<{ getCharacteristic: (c: string) => Promise<BtChar> }> }>; disconnect: () => void } };
type Bt = { requestDevice: (o: { filters: { services: string[] }[] }) => Promise<BtDevice> };
type NativeBridge = { postMessage: (m: unknown) => void };

const bluetooth = (): Bt | undefined => (typeof navigator === "undefined" ? undefined : (navigator as unknown as { bluetooth?: Bt }).bluetooth);
const nativeBridge = (): NativeBridge | undefined => {
  if (typeof window === "undefined") return undefined;
  const w = window as unknown as { __diastoleCaps?: string[]; webkit?: { messageHandlers?: { diastole?: NativeBridge } } };
  return w.__diastoleCaps?.includes("hr") ? w.webkit?.messageHandlers?.diastole : undefined;
};

export function hrSource(): Source {
  if (nativeBridge()) return "native";
  if (bluetooth()) return "web";
  return null;
}

export function useHeartRate(onPacket: (p: HrPacket) => void) {
  const [source, setSource] = useState<Source>(null);
  const [checked, setChecked] = useState(false); // false until after mount
  const [inApp, setInApp] = useState(false);
  const [status, setStatus] = useState<HrStatus>("idle");
  const [bpm, setBpm] = useState<number | null>(null);
  const [device, setDevice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const handler = useRef(onPacket);
  const last = useRef(0);
  const dev = useRef<BtDevice | null>(null);
  const chr = useRef<BtChar | null>(null);

  useEffect(() => {
    handler.current = onPacket;
  }, [onPacket]);

  // Which way in, decided after mount (the server can't know).
  useEffect(() => {
    const t = setTimeout(() => {
      setSource(hrSource());
      setInApp(document.documentElement.dataset.app === "ios");
      setChecked(true);
    }, 0);
    return () => clearTimeout(t);
  }, []);

  const take = useCallback((p: HrPacket) => {
    if (p.bpm == null) return;
    last.current = Date.now();
    setBpm(p.bpm);
    setStatus("live");
    handler.current(p);
  }, []);

  // Flag a sensor that's gone quiet.
  useEffect(() => {
    if (status !== "live") return;
    const t = setInterval(() => {
      if (Date.now() - last.current > 6000) setStatus("lost");
    }, 1000);
    return () => clearInterval(t);
  }, [status]);

  // The iPhone app's events.
  useEffect(() => {
    if (source !== "native") return;
    const on = (e: Event) => {
      const d = (e as CustomEvent<{ bpm?: number; rr?: number[]; device?: string; status?: string; error?: string }>).detail ?? {};
      if (d.device) setDevice(d.device);
      if (d.status === "lost") setStatus("lost");
      if (d.status === "idle") setStatus("idle");
      if (d.status === "connected") setStatus((s) => (s === "live" ? s : "connecting"));
      if (d.error) {
        setError(d.error);
        setStatus("idle");
      }
      if (typeof d.bpm === "number") take({ bpm: d.bpm > 25 && d.bpm < 240 ? d.bpm : null, rr: Array.isArray(d.rr) ? d.rr.filter((x) => x >= 270 && x <= 2000) : [] });
    };
    window.addEventListener("diastole:hr", on);
    return () => window.removeEventListener("diastole:hr", on);
  }, [source, take]);

  const onValue = useCallback((e: Event) => {
    const v = (e.target as BtChar).value;
    if (v) take(parseHeartRate(v));
  }, [take]);
  const onDrop = useCallback(() => setStatus("lost"), []);

  const disconnect = useCallback(() => {
    if (source === "native") nativeBridge()?.postMessage({ type: "hrStop" });
    chr.current?.removeEventListener("characteristicvaluechanged", onValue);
    chr.current?.stopNotifications().catch(() => {});
    dev.current?.removeEventListener("gattserverdisconnected", onDrop);
    if (dev.current?.gatt?.connected) dev.current.gatt.disconnect();
    chr.current = null;
    dev.current = null;
    setStatus("idle");
    setBpm(null);
  }, [source, onValue, onDrop]);

  /** Must run from a tap: the browser shows its own device picker. */
  const connect = useCallback(async () => {
    setError(null);
    setStatus("connecting");
    if (source === "native") {
      nativeBridge()?.postMessage({ type: "hrStart" });
      return;
    }
    const bt = bluetooth();
    if (!bt) return setStatus("error");
    try {
      const d = await bt.requestDevice({ filters: [{ services: ["heart_rate"] }] });
      dev.current = d;
      setDevice(d.name ?? "Heart-rate sensor");
      d.addEventListener("gattserverdisconnected", onDrop);
      const server = await d.gatt!.connect();
      const svc = await server.getPrimaryService("heart_rate");
      const c = await svc.getCharacteristic("heart_rate_measurement");
      chr.current = c;
      c.addEventListener("characteristicvaluechanged", onValue);
      await c.startNotifications();
    } catch (e) {
      const cancelled = e instanceof Error && e.name === "NotFoundError";
      setError(cancelled ? null : "Couldn't connect. Check broadcasting is on and the sensor isn't connected to another app.");
      setStatus(cancelled ? "idle" : "error");
    }
  }, [source, onValue, onDrop]);

  useEffect(() => () => disconnect(), [disconnect]);

  return { source, checked, inApp, status, bpm, device, error, connect, disconnect };
}
