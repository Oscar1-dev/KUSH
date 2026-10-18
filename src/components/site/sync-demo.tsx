"use client";

import { useEffect, useRef, useState } from "react";

import styles from "./sync-demo.module.css";

/**
 * Animated illustration of the real KUSH pipeline: a support ticket opened
 * on the website shows up in Discord, staff reply there, and every change
 * flows back. Plays while on screen; reduced motion shows the final state.
 */

type Side = "web" | "discord";
interface Beat {
  from: Side;
  status: "Open" | "In progress" | "Resolved";
  messages: number;
}

const beats: Beat[] = [
  { from: "web", status: "Open", messages: 0 },
  { from: "web", status: "Open", messages: 1 },
  { from: "discord", status: "In progress", messages: 2 },
  { from: "web", status: "In progress", messages: 3 },
  { from: "discord", status: "Resolved", messages: 4 },
];

const thread: { who: "you" | "staff"; text: string }[] = [
  { who: "you", text: "My licence key says it's already in use?" },
  { who: "staff", text: "Sorted, I've reset the activation. Give it another go." },
  { who: "you", text: "Working now. Legend, cheers." },
  { who: "staff", text: "No worries. Closing this one off." },
];

export default function SyncDemo() {
  const ref = useRef<HTMLDivElement>(null);
  const [beat, setBeat] = useState(0);
  const [pulse, setPulse] = useState(0);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setBeat(beats.length - 1);
      return;
    }
    let timer = 0;
    const io = new IntersectionObserver(([entry]) => {
      window.clearInterval(timer);
      if (entry?.isIntersecting)
        timer = window.setInterval(() => {
          setBeat((value) => (value + 1) % (beats.length + 1));
          setPulse((value) => value + 1);
        }, 2200);
    });
    io.observe(node);
    return () => {
      io.disconnect();
      window.clearInterval(timer);
    };
  }, []);

  // The extra beat at the end holds the resolved state before looping.
  const state = beats[Math.min(beat, beats.length - 1)]!;
  const shown = thread.slice(0, state.messages);
  const tone = state.status === "Resolved" ? styles.ok : state.status === "In progress" ? styles.progress : styles.open;

  return (
    <div ref={ref} className={styles.demo} role="img" aria-label="Illustration: a support ticket syncing between the KUSH website and Discord">
      <div className={styles.window}>
        <div className={styles.bar}>
          <span className={styles.dot} />
          <span className="mono">kush · account / support</span>
        </div>
        <div className={styles.body}>
          <div className={styles.ticketHead}>
            <div>
              <p className="mono">Ticket #0042</p>
              <p className={styles.ticketTitle}>Licence won&apos;t activate</p>
            </div>
            <span key={state.status} className={`${styles.status} ${tone}`}>
              {state.status}
            </span>
          </div>
          <ul className={styles.thread}>
            {shown.map((message, i) => (
              <li key={i} className={message.who === "you" ? styles.mine : styles.theirs}>
                <span className={styles.bubble}>{message.text}</span>
                <span className={`mono ${styles.meta}`}>
                  {message.who === "you" ? "You" : "KUSH Support · replied in Discord"}
                </span>
              </li>
            ))}
            {shown.length === 0 ? <li className={styles.empty}>Ticket opened. The team&apos;s been pinged.</li> : null}
          </ul>
        </div>
      </div>

      <div className={styles.link} aria-hidden="true">
        <span className={styles.rail} />
        <span key={pulse} className={`${styles.packet} ${state.from === "web" ? styles.toDiscord : styles.toWeb}`} />
        <span className={`mono ${styles.linkLabel}`}>Live sync</span>
      </div>

      <div className={`${styles.window} ${styles.discord}`}>
        <div className={styles.bar}>
          <span className={styles.dot} />
          <span className="mono"># ticket-0042</span>
        </div>
        <div className={styles.body}>
          <div className={styles.embed}>
            <p className={styles.embedTitle}>🎫 Ticket created</p>
            <p className={styles.embedText}>Private to you and the KUSH staff handling it.</p>
            <div className={styles.embedFields}>
              <span>
                <b>Ticket</b>#0042
              </span>
              <span>
                <b>Status</b>
                {state.status}
              </span>
            </div>
          </div>
          <ul className={styles.discordThread}>
            {shown.map((message, i) => (
              <li key={i}>
                <span className={`${styles.avatar} ${message.who === "staff" ? styles.avatarStaff : ""}`}>
                  {message.who === "staff" ? "K" : "Y"}
                </span>
                <span>
                  <b className={message.who === "staff" ? styles.staffName : undefined}>
                    {message.who === "staff" ? "KUSH Support" : "You"}
                  </b>
                  {message.who === "you" ? <em className="mono"> via website</em> : null}
                  <span className={styles.discordText}>{message.text}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
