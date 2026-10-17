
"use client";

import { useState, type CSSProperties } from "react";
import {
  AnimatePresence,
  motion,
  useReducedMotion,
} from "motion/react";
import {
  ArrowDownRight,
  ArrowUpRight,
  Asterisk,
  Check,
  Code2,
  Layers3,
  LockKeyhole,
  Terminal,
} from "lucide-react";

import styles from "./studio-showcase.module.css";

const services = [
  {
    id: "01",
    name: "Web & Experiences",
    title: "DIGITAL",
    highlight: "FEELS.",
    category: "CREATIVE DEVELOPMENT",
    description:
      "Websites and interactive experiences with distinctive art direction, thoughtful movement and functional engineering.",
    deliverables: [
      "Custom websites",
      "Interactive interfaces",
      "Frontend engineering",
      "Motion design",
    ],
    accent: "#a7fa43",
    type: "web",
  },
  {
    id: "02",
    name: "Custom Software",
    title: "REAL",
    highlight: "SYSTEMS.",
    category: "SOFTWARE ENGINEERING",
    description:
      "Purpose-built applications and practical tools, designed around the people and workflows they're created for.",
    deliverables: [
      "Windows applications",
      "Business tools",
      "Software development",
      "Custom integrations",
    ],
    accent: "#bd8cff",
    type: "software",
  },
  {
    id: "03",
    name: "APIs & Automation",
    title: "LESS",
    highlight: "FRICTION.",
    category: "CONNECTED INFRASTRUCTURE",
    description:
      "APIs and automation that help independent systems communicate, simplify repeated work and support growing operations.",
    deliverables: [
      "API development",
      "Workflow automation",
      "Backend systems",
      "Service integrations",
    ],
    accent: "#91e8ad",
    type: "api",
  },
  {
    id: "04",
    name: "Discord Systems",
    title: "BETTER",
    highlight: "CONNECTED.",
    category: "COMMUNITY INFRASTRUCTURE",
    description:
      "Thoughtful Discord infrastructure for community management, customer support, staff workflows and automation.",
    deliverables: [
      "Custom Discord bots",
      "Support workflows",
      "Server configuration",
      "Permissions & roles",
    ],
    accent: "#b69cff",
    type: "discord",
  },
] as const;

type ServiceType = (typeof services)[number]["type"];

function WebVisual() {
  return (
    <div className={`${styles.scene} ${styles.webScene}`} aria-hidden="true">
      <div className={styles.sceneTopLabel}>
        <span>INTERACTIVE WEB</span>
        <span>VISUAL STUDY / 01</span>
      </div>

      <div className={styles.browser}>
        <div className={styles.browserTop}>
          <div className={styles.browserDots}>
            <i />
            <i />
            <i />
          </div>

          <span>kush.studio / concept</span>
          <ArrowUpRight size={13} />
        </div>

        <div className={styles.browserContent}>
          <div className={styles.browserNavigation}>
            <span>INDEPENDENT / DIGITAL</span>
            <span>INDEX — 001</span>
          </div>

          <div className={styles.browserMain}>
            <span className={styles.browserOverline}>
              EXPERIENCE DESIGN
            </span>

            <div className={styles.browserTitle}>
              MAKE
              <br />
              <span>IT MATTER.</span>
            </div>

            <div className={styles.browserArt}>
              <div className={styles.browserArtInner} />
              <div className={styles.browserArtLine} />
            </div>
          </div>

          <div className={styles.browserFooter}>
            <span>DESIGN × DEVELOPMENT</span>
            <ArrowUpRight size={17} />
          </div>
        </div>
      </div>

      <div className={styles.sceneFootnote}>
        <span>STRUCTURE</span>
        <span>INTERACTION</span>
        <span>MOTION</span>
      </div>
    </div>
  );
}

function SoftwareVisual() {
  return (
    <div className={`${styles.scene} ${styles.softwareScene}`} aria-hidden="true">
      <div className={styles.sceneTopLabel}>
        <span>DESKTOP SOFTWARE</span>
        <span>INTERFACE STUDY / 02</span>
      </div>

      <div className={styles.desktopWindow}>
        <div className={styles.desktopBar}>
          <span className={styles.desktopAppName}>
            <span className={styles.desktopAppIcon}>K</span>
            KUSH / DEVELOPER
          </span>

          <span className={styles.desktopWindowControls}>
            <i />
            <i />
            <i />
          </span>
        </div>

        <div className={styles.desktopBody}>
          <div className={styles.desktopSidebar}>
            <span className={styles.sidebarActive} />
            <span />
            <span />
            <span />
            <span />
          </div>

          <div className={styles.desktopWorkspace}>
            <div className={styles.desktopHeading}>
              <div>
                <span className={styles.desktopOverline}>
                  PRODUCT INTERFACE / CONCEPT
                </span>
                <strong>THE WORKSPACE.</strong>
              </div>
              <span className={styles.desktopIndicator} />
            </div>

            <div className={styles.desktopCards}>
              <div className={styles.desktopCardPrimary}>
                <span>CONNECTED SYSTEMS</span>
                <div className={styles.desktopSignal}>
                  <span />
                  <span />
                  <span />
                  <span />
                  <span />
                  <span />
                  <span />
                </div>
                <small>ONE PLACE. CLEAR CONTROL.</small>
              </div>

              <div className={styles.desktopCardSecondary}>
                <span>WORKFLOW</span>
                <div className={styles.desktopProgress}>
                  <i />
                  <i />
                  <i />
                </div>
                <small>DESIGNED TO WORK</small>
              </div>
            </div>

            <div className={styles.desktopActivity}>
              <span>APPLICATION ARCHITECTURE</span>
              <div>
                <i />
                <i />
                <i />
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className={styles.sceneFootnote}>
        <span>DESKTOP</span>
        <span>SYSTEMS</span>
        <span>CONTROL</span>
      </div>
    </div>
  );
}

function ApiVisual() {
  return (
    <div className={`${styles.scene} ${styles.apiScene}`} aria-hidden="true">
      <div className={styles.sceneTopLabel}>
        <span>CONNECTED WORKFLOWS</span>
        <span>SYSTEM STUDY / 03</span>
      </div>

      <div className={styles.apiNetwork}>
        <div className={styles.networkLine} />

        <div className={styles.networkNode}>
          <div className={styles.networkNodeIcon}>
            <Code2 size={21} />
          </div>
          <div>
            <span>01 / INPUT</span>
            <strong>REQUEST</strong>
          </div>
          <span className={styles.nodeIndex}>01</span>
        </div>

        <div className={styles.networkConnector}>
          <span className={styles.connectorSignal} />
          <span>VALIDATE / TRANSFORM</span>
        </div>

        <div className={`${styles.networkNode} ${styles.networkNodeActive}`}>
          <div className={styles.networkNodeIcon}>
            <Asterisk size={23} />
          </div>
          <div>
            <span>02 / PROCESS</span>
            <strong>AUTOMATE</strong>
          </div>
          <span className={styles.nodeIndex}>02</span>
        </div>

        <div className={styles.networkConnector}>
          <span className={styles.connectorSignal} />
          <span>CONNECT / DELIVER</span>
        </div>

        <div className={styles.networkNode}>
          <div className={styles.networkNodeIcon}>
            <Check size={21} />
          </div>
          <div>
            <span>03 / OUTPUT</span>
            <strong>RESPONSE</strong>
          </div>
          <span className={styles.nodeIndex}>03</span>
        </div>
      </div>

      <div className={styles.sceneFootnote}>
        <span>INPUT</span>
        <span>LOGIC</span>
        <span>OUTPUT</span>
      </div>
    </div>
  );
}

function DiscordVisual() {
  return (
    <div className={`${styles.scene} ${styles.discordScene}`} aria-hidden="true">
      <div className={styles.sceneTopLabel}>
        <span>COMMUNITY SYSTEMS</span>
        <span>WORKFLOW STUDY / 04</span>
      </div>

      <div className={styles.ticketWindow}>
        <div className={styles.ticketHeader}>
          <span className={styles.ticketSymbol}>K</span>
          <div>
            <strong>KUSH SUPPORT</strong>
            <span>PRIVATE TICKET WORKFLOW</span>
          </div>
          <LockKeyhole size={16} />
        </div>

        <div className={styles.ticketBody}>
          <div className={styles.ticketIdentity}>
            <span>SUPPORT REQUEST / CONCEPT</span>
            <strong>Customer assistance</strong>
          </div>

          <div className={styles.ticketMessage}>
            <span className={styles.ticketAvatar}>01</span>
            <div>
              <span>CUSTOMER</span>
              <p>I need some help with my product.</p>
            </div>
          </div>

          <div className={`${styles.ticketMessage} ${styles.staffMessage}`}>
            <span className={styles.ticketAvatar}>K</span>
            <div>
              <span>SUPPORT TEAM</span>
              <p>Let's get this sorted for you.</p>
            </div>
          </div>

          <div className={styles.ticketTimeline}>
            <span>
              <i />
              CREATED
            </span>
            <span>
              <i />
              ASSIGNED
            </span>
            <span>
              <i />
              RESOLVED
            </span>
          </div>
        </div>
      </div>

      <div className={styles.sceneFootnote}>
        <span>SUPPORT</span>
        <span>PRIVACY</span>
        <span>AUTOMATION</span>
      </div>
    </div>
  );
}

function ServiceVisual({ type }: { type: ServiceType }) {
  switch (type) {
    case "web":
      return <WebVisual />;
    case "software":
      return <SoftwareVisual />;
    case "api":
      return <ApiVisual />;
    case "discord":
      return <DiscordVisual />;
  }
}

export default function StudioShowcase() {
  const [activeIndex, setActiveIndex] = useState(0);
  const reducedMotion = Boolean(useReducedMotion());
  const active = services[activeIndex];

  const transition = {
    duration: reducedMotion ? 0 : 0.45,
    ease: [0.16, 1, 0.3, 1] as [number, number, number, number],
  };

  return (
    <>
      <section
        className={styles.studio}
        id="studio"
        aria-labelledby="studio-heading"
      >
        <div className={styles.sectionMeta}>
          <span>01 / THE STUDIO</span>
          <span className={styles.metaRight}>
            INDEPENDENT BY DESIGN
            <Asterisk size={15} aria-hidden="true" />
          </span>
        </div>

        <div className={styles.introGrid}>
          <motion.div
            initial={reducedMotion ? false : { opacity: 0, y: 45 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.2 }}
            transition={transition}
          >
            <p className={styles.smallHeading}>
              THE NEXT GENERATION
              <br />
              OF DIGITAL CREATIVITY
            </p>

            <h2 id="studio-heading" className={styles.statement}>
              NO
              <br />
              <span>ORDINARY</span>
              <br />
              DIGITAL.
            </h2>
          </motion.div>

          <motion.div
            className={styles.introAside}
            initial={reducedMotion ? false : { opacity: 0, y: 26 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.25 }}
            transition={transition}
          >
            <div className={styles.introIcon}>
              <Layers3 size={25} strokeWidth={1.4} />
            </div>

            <p>
              KUSH is an independent creative technology studio
              combining expressive design with practical engineering.
            </p>

            <p className={styles.mutedParagraph}>
              From websites and applications to automation and
              connected services, we build digital experiences
              with a distinct point of view.
            </p>

            <a className={styles.textLink} href="#work">
              EXPLORE WHAT WE DO
              <ArrowDownRight size={18} aria-hidden="true" />
            </a>
          </motion.div>
        </div>

        <div className={styles.identityStrip} aria-hidden="true">
          <span>CREATIVE</span>
          <span className={styles.stripSymbol}>✳</span>
          <span>TECHNOLOGY</span>
          <span className={styles.stripSymbol}>✳</span>
          <span>CULTURE</span>
        </div>
      </section>

      <section
        className={styles.work}
        id="work"
        aria-labelledby="work-heading"
      >
        <div className={styles.sectionMeta}>
          <span>02 / OUR CAPABILITIES</span>
          <span className={styles.metaRight}>
            FOUR DISCIPLINES / ONE STUDIO
          </span>
        </div>

        <motion.div
          className={styles.workHeading}
          initial={reducedMotion ? false : { opacity: 0, y: 35 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.2 }}
          transition={transition}
        >
          <div>
            <p className={styles.smallHeading}>WHAT WE CREATE</p>
            <h2 id="work-heading">
              OUR <em>WORLD.</em>
            </h2>
          </div>

          <p className={styles.workDescription}>
            Different disciplines. One connected approach.
            Select a capability to explore what KUSH builds.
          </p>
        </motion.div>

        <div className={styles.showcaseLayout}>
          <div
            className={styles.selector}
            role="group"
            aria-label="KUSH capabilities"
          >
            {services.map((service, index) => (
              <button
                type="button"
                key={service.id}
                className={`${styles.selectorButton} ${
                  activeIndex === index ? styles.selectorActive : ""
                }`}
                aria-pressed={activeIndex === index}
                aria-controls="kush-service-details"
                onClick={() => setActiveIndex(index)}
              >
                <span className={styles.selectorNumber}>
                  {service.id}
                </span>

                <span className={styles.selectorName}>
                  {service.name}
                </span>

                <ArrowUpRight
                  size={21}
                  className={styles.selectorArrow}
                  aria-hidden="true"
                />
              </button>
            ))}
          </div>

          <div
            className={styles.feature}
            id="kush-service-details"
            role="region"
            aria-label="Selected service information"
            aria-live="polite"
            style={
              {
                "--feature-accent": active.accent,
              } as CSSProperties
            }
          >
            <div className={styles.featureTop}>
              <span>{active.category}</span>
              <span>KUSH / {active.id}</span>
            </div>

            <AnimatePresence mode="wait" initial={false}>
              <motion.div
                key={active.id}
                className={styles.featureStage}
                initial={
                  reducedMotion
                    ? { opacity: 1 }
                    : { opacity: 0, y: 16 }
                }
                animate={{ opacity: 1, y: 0 }}
                exit={
                  reducedMotion
                    ? { opacity: 0 }
                    : { opacity: 0, y: -12 }
                }
                transition={transition}
              >
                <div className={styles.featureNarrative}>
                  <div className={styles.featureIcon}>
                    {active.type === "web" && <Layers3 size={23} />}
                    {active.type === "software" && <Code2 size={23} />}
                    {active.type === "api" && <Terminal size={23} />}
                    {active.type === "discord" && <Asterisk size={23} />}
                  </div>

                  <h3>
                    {active.title}
                    <br />
                    <span>{active.highlight}</span>
                  </h3>

                  <p className={styles.featureDescription}>
                    {active.description}
                  </p>

                  <div className={styles.deliverables}>
                    <span className={styles.deliverablesHeading}>
                      AREAS OF WORK
                    </span>

                    <div className={styles.tagList}>
                      {active.deliverables.map((item) => (
                        <span key={item} className={styles.tag}>
                          {item}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>

                <div className={styles.featureArtwork}>
                  <ServiceVisual type={active.type} />
                  <span className={styles.conceptDisclaimer}>
                    ILLUSTRATIVE CONCEPT / NOT LIVE PRODUCT DATA
                  </span>
                </div>
              </motion.div>
            </AnimatePresence>

            <div className={styles.featureBottom}>
              <span>BUILT WITH PURPOSE.</span>

              <a href="#contact">
                MORE ABOUT KUSH
                <ArrowUpRight size={17} aria-hidden="true" />
              </a>
            </div>
          </div>
        </div>

        <div className={styles.bottomMessage}>
          <span className={styles.messageIndex}>
            KUSH® / STUDIO
          </span>

          <p>
            GOOD DESIGN GETS ATTENTION.
            <br />
            <strong>GOOD SOFTWARE EARNS TRUST.</strong>
          </p>
        </div>
      </section>
    </>
  );
}
