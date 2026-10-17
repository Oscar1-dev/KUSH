
"use client";

import { useEffect, useRef } from "react";
import styles from "./kush-mark.module.css";

type LeafletSpec = {
  angle: number;
  length: number;
  width: number;
  teeth: number;
  colour: string;
};

const leaflets: LeafletSpec[] = [
  { angle: -77, length: 162, width: 23, teeth: 8, colour: "#419a42" },
  { angle: -55, length: 218, width: 32, teeth: 10, colour: "#55ad45" },
  { angle: -31, length: 262, width: 38, teeth: 12, colour: "#63bd4a" },
  { angle: 0, length: 314, width: 45, teeth: 14, colour: "#3d9d40" },
  { angle: 31, length: 262, width: 38, teeth: 12, colour: "#68c44d" },
  { angle: 55, length: 218, width: 32, teeth: 10, colour: "#499b40" },
  { angle: 77, length: 162, width: 23, teeth: 8, colour: "#6ab849" },
];

function silhouette(length: number, width: number, teeth: number) {
  const envelope = (t: number) =>
    Math.pow(
      Math.max(0, Math.sin(Math.PI * Math.min(0.999, Math.max(0, t)))),
      0.88
    );

  const side: Array<[number, number]> = [];

  for (let i = 0; i < teeth; i++) {
    const step = 0.77 / teeth;
    const base = 0.11 + i * step;

    const point = base + step * 0.46;
    const valley = base + step * 0.74;

    side.push([
      -width * envelope(point),
      -length * point,
    ]);

    side.push([
      -width * envelope(valley) * 0.68,
      -length * valley,
    ]);
  }

  const points: Array<[number, number]> = [
    [0, 0],
    [-width * 0.25, -length * 0.065],
    ...side,
    [0, -length],
    ...side
      .slice()
      .reverse()
      .map(([x, y]): [number, number] => [-x, y]),
    [width * 0.25, -length * 0.065],
  ];

  return (
    "M " +
    points
      .map(([x, y]) => `${x.toFixed(2)},${y.toFixed(2)}`)
      .join(" L ") +
    " Z"
  );
}

function Leaflet({
  angle,
  length,
  width,
  teeth,
  colour,
}: LeafletSpec) {
  return (
    <g transform={`rotate(${angle})`}>
      <path
        d={silhouette(length, width, teeth)}
        fill={colour}
        stroke="#0b1710"
        strokeWidth="5.5"
        strokeLinejoin="round"
      />

      <path
        d={`M 0,0 Q 1,${-length * 0.48} 0,${-length * 0.93}`}
        fill="none"
        stroke="#b6e984"
        strokeWidth="2.2"
        strokeLinecap="round"
        opacity="0.44"
      />
    </g>
  );
}

export default function KushMark() {
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const element = root.current;
    const hero = element?.closest(".hero");

    if (!element || !(hero instanceof HTMLElement)) return;

    const motionQuery = window.matchMedia(
      "(prefers-reduced-motion: reduce)"
    );

    function handleMove(event: PointerEvent) {
      if (
        !element ||
        !hero ||
        event.pointerType !== "mouse" ||
        motionQuery.matches
      ) {
        return;
      }

      const rect = hero.getBoundingClientRect();

      const x = (event.clientX - rect.left) / rect.width;
      const y = (event.clientY - rect.top) / rect.height;

      const normalizedX = Math.max(-1, Math.min(1, x * 2 - 1));
      const normalizedY = Math.max(-1, Math.min(1, y * 2 - 1));

      element.style.setProperty(
        "--leaf-x",
        `${(normalizedX * 13).toFixed(2)}px`
      );

      element.style.setProperty(
        "--leaf-y",
        `${(normalizedY * 10).toFixed(2)}px`
      );
    }

    function reset() {
      if (!element) return;

      element.style.setProperty("--leaf-x", "0px");
      element.style.setProperty("--leaf-y", "0px");
    }

    hero.addEventListener("pointermove", handleMove, {
      passive: true,
    });
    hero.addEventListener("pointerleave", reset);
    window.addEventListener("blur", reset);

    return () => {
      hero.removeEventListener("pointermove", handleMove);
      hero.removeEventListener("pointerleave", reset);
      window.removeEventListener("blur", reset);
    };
  }, []);

  return (
    <div className={styles.root} ref={root} aria-hidden="true">
      <div className={styles.logo}>
        <svg
          className={styles.leaf}
          viewBox="0 0 600 570"
          xmlns="http://www.w3.org/2000/svg"
          focusable="false"
        >
          <defs>
            <linearGradient
              id="kushStem"
              x1="0"
              y1="0"
              x2="1"
              y2="0"
            >
              <stop offset="0%" stopColor="#247a35" />
              <stop offset="45%" stopColor="#4dad45" />
              <stop offset="100%" stopColor="#225d30" />
            </linearGradient>
          </defs>

          <g transform="translate(300 402)">
            <path
              d="M 0,-5 C 8,33 4,66 -20,125"
              fill="none"
              stroke="#0b1710"
              strokeWidth="21"
              strokeLinecap="round"
            />

            <path
              d="M 0,-5 C 8,33 4,66 -20,125"
              fill="none"
              stroke="url(#kushStem)"
              strokeWidth="13"
              strokeLinecap="round"
            />

            {leaflets.map((leaflet) => (
              <Leaflet
                key={leaflet.angle}
                {...leaflet}
              />
            ))}
          </g>
        </svg>

        <div className={styles.wordmark}>
          <strong>K<span>U</span>SH</strong>
          <small>CREATIVE TECHNOLOGY STUDIO</small>
        </div>
      </div>
    </div>
  );
}
