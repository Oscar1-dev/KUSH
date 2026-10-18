"use client";

import Link from "next/link";
import { useRef, useState } from "react";

import type { Service } from "@/lib/site-content";
import { Arrow } from "./arrow";
import styles from "./effects.module.css";
import site from "./site.module.css";

/**
 * The service index. On desktop a preview card floats with the cursor,
 * showing the hovered service's number and what's included; it glides
 * between rows rather than jumping.
 */
export default function ServiceList({ services }: { services: Service[] }) {
  const list = useRef<HTMLDivElement>(null);
  const card = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState<number | null>(null);
  const pos = useRef({ x: 0, y: 0, tx: 0, ty: 0, frame: 0 });

  const follow = () => {
    const p = pos.current;
    p.x += (p.tx - p.x) * 0.16;
    p.y += (p.ty - p.y) * 0.16;
    if (card.current) card.current.style.transform = `translate3d(${p.x}px, ${p.y}px, 0) rotate(${(p.tx - p.x) * 0.02}deg)`;
    p.frame = Math.abs(p.tx - p.x) + Math.abs(p.ty - p.y) > 0.5 ? requestAnimationFrame(follow) : 0;
  };
  const onMove = (event: React.PointerEvent) => {
    if (event.pointerType !== "mouse" || !list.current) return;
    const rect = list.current.getBoundingClientRect();
    const p = pos.current;
    p.tx = event.clientX - rect.left + 28;
    p.ty = event.clientY - rect.top - 120;
    if (!p.frame) p.frame = requestAnimationFrame(follow);
  };

  const shown = active === null ? null : services[active];

  return (
    <div ref={list} className={styles.serviceWrap} onPointerMove={onMove} onPointerLeave={() => setActive(null)}>
      <ul className={site.serviceList}>
      {services.map((service, i) => (
        <li
          key={service.slug}
          className={site.serviceItem}
          data-reveal
          style={{ "--reveal-i": i } as React.CSSProperties}
          onPointerEnter={() => setActive(i)}
        >
          <Link href={`/services/${service.slug}`} className={site.serviceLink} data-dim={active !== null && active !== i}>
            <span className={`mono ${site.serviceIndex}`}>{service.index}</span>
            <h3 className={site.serviceName}>{service.name}</h3>
            <p className={site.serviceSummary}>{service.summary}</p>
            <span className={site.serviceArrow}>
              <Arrow up size={20} />
            </span>
          </Link>
        </li>
      ))}
      </ul>
      <div ref={card} className={styles.preview} data-on={shown !== null} aria-hidden="true">
        {shown ? (
          <>
            <span className={`rainbow ${styles.previewIndex}`}>{shown.index}</span>
            <span className={styles.previewLeaf} />
            <ul>
              {shown.offerings.slice(0, 4).map((offering) => (
                <li key={offering.title}>{offering.title}</li>
              ))}
            </ul>
          </>
        ) : null}
      </div>
    </div>
  );
}
