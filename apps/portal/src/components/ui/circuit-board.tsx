/* Circuit board — animated node/trace diagram.
 *
 * Dropped in as provided, with one adaptation for this project: the portal's
 * index.css imports Tailwind's theme and utilities but deliberately NOT
 * Preflight, and Preflight is what sets `border-style: solid` globally. A
 * bare `border-2` therefore sets a width against CSS's default style of
 * `none` and renders nothing at all, so every border class here carries an
 * explicit `border-solid`. The "use client" directive was dropped — this is
 * a Vite SPA, not Next.js, where it means nothing.
 */

import * as React from "react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

interface CircuitNode {
  id: string;
  x: number;
  y: number;
  label?: string;
  icon?: React.ReactNode;
  status?: "active" | "inactive" | "processing" | "error";
  size?: "sm" | "md" | "lg";
}

interface CircuitConnection {
  from: string;
  to: string;
  animated?: boolean;
  bidirectional?: boolean;
  color?: string;
  pulseColor?: string;
}

interface CircuitBoardProps extends React.HTMLAttributes<HTMLDivElement> {
  nodes: CircuitNode[];
  connections: CircuitConnection[];
  width?: number;
  height?: number;
  gridSize?: number;
  showGrid?: boolean;
  gridColor?: string;
  traceColor?: string;
  pulseColor?: string;
  nodeColor?: string;
  pulseSpeed?: number;
  traceWidth?: number;
  /** Force a specific theme variant. Defaults to auto-detect from system. */
  variant?: "light" | "dark" | "auto";
}

function CircuitBoard({
  nodes,
  connections,
  width = 600,
  height = 400,
  gridSize = 20,
  showGrid = true,
  gridColor,
  traceColor,
  pulseColor,
  nodeColor,
  pulseSpeed = 2,
  traceWidth = 2,
  variant = "auto",
  className,
  ...props
}: CircuitBoardProps) {
  const [isDark, setIsDark] = React.useState(true);

  React.useEffect(() => {
    if (variant !== "auto") {
      setIsDark(variant === "dark");
      return;
    }

    const checkTheme = () => {
      const isDarkMode =
        document.documentElement.classList.contains("dark") ||
        document.body.classList.contains("dark");
      setIsDark(isDarkMode);
    };

    checkTheme();

    const observer = new MutationObserver(checkTheme);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class"],
    });
    observer.observe(document.body, {
      attributes: true,
      attributeFilter: ["class"],
    });

    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
    mediaQuery.addEventListener("change", checkTheme);

    return () => {
      observer.disconnect();
      mediaQuery.removeEventListener("change", checkTheme);
    };
  }, [variant]);

  const computedGridColor =
    gridColor ||
    (isDark ? "rgba(163, 163, 163, 0.08)" : "rgba(64, 64, 64, 0.12)");
  const computedTraceColor =
    traceColor ||
    (isDark ? "rgba(163, 163, 163, 0.25)" : "rgba(64, 64, 64, 0.35)");
  const computedPulseColor =
    pulseColor ||
    (isDark ? "rgba(163, 163, 163, 0.6)" : "rgba(64, 64, 64, 0.7)");
  const computedNodeColor =
    nodeColor ||
    (isDark ? "rgba(163, 163, 163, 0.5)" : "rgba(64, 64, 64, 0.6)");

  const nodeMap = React.useMemo(() => {
    return new Map(nodes.map((node) => [node.id, node]));
  }, [nodes]);

  const getNodeSize = React.useCallback((size?: CircuitNode["size"]) => {
    switch (size) {
      case "sm":
        return 24;
      case "lg":
        return 48;
      default:
        return 36;
    }
  }, []);

  const calculatePath = React.useCallback(
    (from: CircuitNode, to: CircuitNode): string => {
      const fromSize = getNodeSize(from.size) / 2 + 4;
      const toSize = getNodeSize(to.size) / 2 + 4;

      const dx = to.x - from.x;
      const dy = to.y - from.y;

      let startX = from.x;
      const startY = from.y;
      let endX = to.x;
      let endY = to.y;

      if (Math.abs(dx) > Math.abs(dy)) {
        startX = from.x + (dx > 0 ? fromSize : -fromSize);
        endX = to.x + (dx > 0 ? -toSize : toSize);
        const midX = from.x + dx / 2;
        return `M ${startX} ${startY} H ${midX} V ${endY} H ${endX}`;
      } else {
        const adjustedStartY = from.y + (dy > 0 ? fromSize : -fromSize);
        endY = to.y + (dy > 0 ? -toSize : toSize);
        const midY = from.y + dy / 2;
        return `M ${startX} ${adjustedStartY} V ${midY} H ${endX} V ${endY}`;
      }
    },
    [getNodeSize],
  );

  /* The stock palette is monochrome — every state renders as another shade of
   * grey, which is fine for decoration and useless for a diagram whose whole
   * job is to say which stage is satisfied and which is blocked. These are
   * the portal's own status colours, the same ones the queue's badges use, so
   * a stage reads the same on the dashboard as it does in the queue.
   *
   * Green and red is the classic colour-blind pair, and it is safe here only
   * because status is never carried by colour alone: every node has a text
   * label and an icon, and the dashboard repeats the counts in a written
   * legend beneath the board. */
  const getStatusColor = (status?: CircuitNode["status"]) => {
    switch (status) {
      case "active":
        return isDark ? "#3fb950" : "#1a7f37";
      case "processing":
        return isDark ? "#f0b429" : "#9a6700";
      case "error":
        return isDark ? "#e5534b" : "#b3261e";
      default:
        return computedNodeColor;
    }
  };

  return (
    <div
      className={cn("relative overflow-hidden", className)}
      style={{ width, height }}
      {...props}
    >
      <svg
        width={width}
        height={height}
        className="absolute inset-0"
        style={{ overflow: "visible" }}
      >
        <defs>
          <filter id="glow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="3" result="coloredBlur" />
            <feMerge>
              <feMergeNode in="coloredBlur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>

          {showGrid && (
            <pattern
              id="circuitGrid"
              width={gridSize}
              height={gridSize}
              patternUnits="userSpaceOnUse"
            >
              <circle
                cx={gridSize / 2}
                cy={gridSize / 2}
                r="0.5"
                fill={computedGridColor}
              />
            </pattern>
          )}

          {connections.map((conn, i) => (
            <linearGradient
              key={`gradient-${i}`}
              id={`electricGradient-${i}`}
              gradientUnits="userSpaceOnUse"
            >
              <stop offset="0%" stopColor="transparent" />
              <stop offset="40%" stopColor="transparent" />
              <stop
                offset="50%"
                stopColor={conn.pulseColor || computedPulseColor}
              />
              <stop offset="60%" stopColor="transparent" />
              <stop offset="100%" stopColor="transparent" />
            </linearGradient>
          ))}
        </defs>

        {showGrid && (
          <rect width={width} height={height} fill="url(#circuitGrid)" />
        )}

        {connections.map((conn, i) => {
          const fromNode = nodeMap.get(conn.from);
          const toNode = nodeMap.get(conn.to);
          if (!fromNode || !toNode) return null;

          const path = calculatePath(fromNode, toNode);
          const pathLength = 500;

          return (
            <g key={`connection-${i}`}>
              <motion.path
                d={path}
                fill="none"
                stroke={conn.color || computedTraceColor}
                strokeWidth={traceWidth}
                strokeLinecap="round"
                strokeLinejoin="round"
                initial={{ pathLength: 0 }}
                animate={{ pathLength: 1 }}
                transition={{ duration: 1, delay: i * 0.2 }}
              />

              {conn.animated !== false && (
                <motion.path
                  d={path}
                  fill="none"
                  stroke={conn.pulseColor || computedPulseColor}
                  strokeWidth={traceWidth + 2}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  filter="url(#glow)"
                  strokeDasharray={`${pathLength * 0.1} ${pathLength * 0.9}`}
                  initial={{ strokeDashoffset: pathLength }}
                  animate={{ strokeDashoffset: -pathLength }}
                  transition={{
                    duration: pulseSpeed,
                    repeat: Infinity,
                    ease: "linear",
                    delay: i * 0.3,
                  }}
                />
              )}

              {conn.bidirectional && (
                <motion.path
                  d={path}
                  fill="none"
                  stroke={conn.pulseColor || computedPulseColor}
                  strokeWidth={traceWidth + 2}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  filter="url(#glow)"
                  strokeDasharray={`${pathLength * 0.1} ${pathLength * 0.9}`}
                  initial={{ strokeDashoffset: -pathLength }}
                  animate={{ strokeDashoffset: pathLength }}
                  transition={{
                    duration: pulseSpeed,
                    repeat: Infinity,
                    ease: "linear",
                    delay: i * 0.3 + pulseSpeed / 2,
                  }}
                />
              )}
            </g>
          );
        })}
      </svg>

      {nodes.map((node, i) => {
        const size = getNodeSize(node.size);
        const statusColor = getStatusColor(node.status);

        return (
          <motion.div
            key={node.id}
            className="absolute flex items-center justify-center"
            style={{
              left: node.x - size / 2,
              top: node.y - size / 2,
              width: size,
              height: size,
            }}
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ delay: i * 0.1 + 0.5, type: "spring" }}
          >
            <motion.div
              className="absolute inset-0 rounded-lg"
              style={{ backgroundColor: statusColor }}
              animate={
                node.status === "processing"
                  ? { opacity: [0.2, 0.5, 0.2] }
                  : { opacity: 0.2 }
              }
              transition={
                node.status === "processing"
                  ? { duration: 1.5, repeat: Infinity }
                  : {}
              }
            />

            <div
              className="absolute inset-0 rounded-lg border-2 border-solid"
              style={{ borderColor: statusColor }}
            />

            {node.status === "active" && (
              <motion.div
                className="absolute inset-0 rounded-lg"
                style={{
                  boxShadow: `0 0 20px ${statusColor}40, inset 0 0 10px ${statusColor}20`,
                }}
                animate={{ opacity: [0.5, 1, 0.5] }}
                transition={{ duration: 2, repeat: Infinity }}
              />
            )}

            <div className="relative z-10 flex flex-col items-center justify-center">
              {node.icon && (
                <div style={{ color: statusColor }}>{node.icon}</div>
              )}
            </div>

            {node.label && (
              <div
                className="absolute -bottom-6 left-1/2 -translate-x-1/2 whitespace-nowrap text-xs font-medium"
                style={{ color: statusColor }}
              >
                {node.label}
              </div>
            )}
          </motion.div>
        );
      })}
    </div>
  );
}

/* ── Pre-built patterns ─────────────────────────────────────────────────── */

interface CircuitPatternProps
  extends Omit<CircuitBoardProps, "nodes" | "connections"> {
  pattern: "data-flow" | "network" | "processor" | "tree";
}

function CircuitPattern({ pattern, ...props }: CircuitPatternProps) {
  const patterns = {
    "data-flow": {
      nodes: [
        { id: "input", x: 50, y: 200, label: "Input", status: "active" as const },
        { id: "process1", x: 200, y: 100, label: "Process", status: "processing" as const },
        { id: "process2", x: 200, y: 300, label: "Validate", status: "active" as const },
        { id: "merge", x: 400, y: 200, label: "Merge", status: "active" as const },
        { id: "output", x: 550, y: 200, label: "Output", status: "active" as const },
      ],
      connections: [
        { from: "input", to: "process1", animated: true },
        { from: "input", to: "process2", animated: true },
        { from: "process1", to: "merge", animated: true },
        { from: "process2", to: "merge", animated: true },
        { from: "merge", to: "output", animated: true },
      ],
    },
    network: {
      nodes: [
        { id: "server", x: 300, y: 80, label: "Server", status: "active" as const, size: "lg" as const },
        { id: "client1", x: 100, y: 200, label: "Client 1", status: "active" as const },
        { id: "client2", x: 300, y: 250, label: "Client 2", status: "processing" as const },
        { id: "client3", x: 500, y: 200, label: "Client 3", status: "active" as const },
        { id: "db", x: 300, y: 350, label: "Database", status: "active" as const },
      ],
      connections: [
        { from: "server", to: "client1", bidirectional: true },
        { from: "server", to: "client2", bidirectional: true },
        { from: "server", to: "client3", bidirectional: true },
        { from: "server", to: "db", bidirectional: true },
      ],
    },
    processor: {
      nodes: [
        { id: "alu", x: 300, y: 200, label: "ALU", status: "processing" as const, size: "lg" as const },
        { id: "reg1", x: 150, y: 100, label: "R1", status: "active" as const, size: "sm" as const },
        { id: "reg2", x: 150, y: 200, label: "R2", status: "active" as const, size: "sm" as const },
        { id: "reg3", x: 150, y: 300, label: "R3", status: "active" as const, size: "sm" as const },
        { id: "cache", x: 450, y: 200, label: "Cache", status: "active" as const },
        { id: "out", x: 550, y: 200, label: "Out", status: "active" as const, size: "sm" as const },
      ],
      connections: [
        { from: "reg1", to: "alu", animated: true },
        { from: "reg2", to: "alu", animated: true },
        { from: "reg3", to: "alu", animated: true },
        { from: "alu", to: "cache", animated: true },
        { from: "cache", to: "out", animated: true },
      ],
    },
    tree: {
      nodes: [
        { id: "root", x: 300, y: 50, label: "Root", status: "active" as const },
        { id: "l1", x: 150, y: 150, label: "L1", status: "active" as const },
        { id: "r1", x: 450, y: 150, label: "R1", status: "processing" as const },
        { id: "l1l", x: 80, y: 280, label: "L1L", status: "active" as const, size: "sm" as const },
        { id: "l1r", x: 220, y: 280, label: "L1R", status: "active" as const, size: "sm" as const },
        { id: "r1l", x: 380, y: 280, label: "R1L", status: "error" as const, size: "sm" as const },
        { id: "r1r", x: 520, y: 280, label: "R1R", status: "active" as const, size: "sm" as const },
      ],
      connections: [
        { from: "root", to: "l1", animated: true },
        { from: "root", to: "r1", animated: true },
        { from: "l1", to: "l1l", animated: true },
        { from: "l1", to: "l1r", animated: true },
        { from: "r1", to: "r1l", animated: true },
        { from: "r1", to: "r1r", animated: true },
      ],
    },
  };

  const selectedPattern = patterns[pattern];
  return (
    <CircuitBoard
      nodes={selectedPattern.nodes}
      connections={selectedPattern.connections}
      {...props}
    />
  );
}

/* ── Standalone node, for custom layouts ────────────────────────────────── */

interface CircuitNodeComponentProps {
  status?: "active" | "inactive" | "processing" | "error";
  size?: "sm" | "md" | "lg";
  glowColor?: string;
  children?: React.ReactNode;
  className?: string;
  onClick?: () => void;
}

function CircuitNode({
  status = "inactive",
  size = "md",
  glowColor,
  children,
  className,
  onClick,
}: CircuitNodeComponentProps) {
  const [isDark, setIsDark] = React.useState(true);

  React.useEffect(() => {
    const checkTheme = () => {
      const isDarkMode =
        document.documentElement.classList.contains("dark") ||
        document.body.classList.contains("dark");
      setIsDark(isDarkMode);
    };

    checkTheme();

    const observer = new MutationObserver(checkTheme);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class"],
    });
    observer.observe(document.body, {
      attributes: true,
      attributeFilter: ["class"],
    });

    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
    mediaQuery.addEventListener("change", checkTheme);

    return () => {
      observer.disconnect();
      mediaQuery.removeEventListener("change", checkTheme);
    };
  }, []);

  const sizeClasses = {
    sm: "w-8 h-8",
    md: "w-12 h-12",
    lg: "w-16 h-16",
  };

  // Same status palette as CircuitBoard above, for the same reason.
  const statusColors = isDark
    ? {
        active: "#3fb950",
        inactive: "rgba(139, 148, 158, 0.45)",
        processing: "#f0b429",
        error: "#e5534b",
      }
    : {
        active: "#1a7f37",
        inactive: "rgba(100, 100, 100, 0.5)",
        processing: "#9a6700",
        error: "#b3261e",
      };

  const color = glowColor || statusColors[status];

  return (
    <motion.div
      className={cn(
        "relative flex items-center justify-center rounded-lg border border-solid",
        isDark ? "bg-neutral-900/50" : "bg-neutral-200/60",
        sizeClasses[size],
        className,
      )}
      style={{ borderColor: color }}
      whileHover={{ scale: 1.1 }}
      whileTap={{ scale: 0.95 }}
      onClick={onClick}
    >
      {status === "processing" && (
        <motion.div
          className="absolute inset-0 rounded-lg"
          style={{ backgroundColor: color }}
          animate={{ opacity: [0.1, 0.3, 0.1] }}
          transition={{ duration: 1.5, repeat: Infinity }}
        />
      )}

      {status === "active" && (
        <div
          className="absolute inset-0 rounded-lg"
          style={{
            boxShadow: `0 0 20px ${color}60, 0 0 40px ${color}30`,
          }}
        />
      )}

      {status === "error" && (
        <motion.div
          className="absolute inset-0 rounded-lg"
          style={{ boxShadow: `0 0 20px ${color}80` }}
          animate={{ opacity: [0.5, 1, 0.5] }}
          transition={{ duration: 0.5, repeat: Infinity }}
        />
      )}

      <div className="relative z-10" style={{ color }}>
        {children}
      </div>
    </motion.div>
  );
}

/* ── Standalone trace ───────────────────────────────────────────────────── */

interface CircuitTraceProps {
  path: string;
  animated?: boolean;
  color?: string;
  pulseColor?: string;
  width?: number;
  pulseSpeed?: number;
}

function CircuitTrace({
  path,
  animated = true,
  color,
  pulseColor,
  width = 2,
  pulseSpeed = 2,
}: CircuitTraceProps) {
  const [isDark, setIsDark] = React.useState(true);

  React.useEffect(() => {
    const checkTheme = () => {
      const isDarkMode =
        document.documentElement.classList.contains("dark") ||
        document.body.classList.contains("dark");
      setIsDark(isDarkMode);
    };

    checkTheme();

    const observer = new MutationObserver(checkTheme);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class"],
    });
    observer.observe(document.body, {
      attributes: true,
      attributeFilter: ["class"],
    });

    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
    mediaQuery.addEventListener("change", checkTheme);

    return () => {
      observer.disconnect();
      mediaQuery.removeEventListener("change", checkTheme);
    };
  }, []);

  const computedColor =
    color || (isDark ? "rgba(163, 163, 163, 0.25)" : "rgba(64, 64, 64, 0.35)");
  const computedPulseColor =
    pulseColor ||
    (isDark ? "rgba(163, 163, 163, 0.6)" : "rgba(64, 64, 64, 0.7)");
  const pathLength = 500;

  return (
    <svg className="absolute inset-0 overflow-visible pointer-events-none">
      <defs>
        <filter id="traceGlow" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="3" result="coloredBlur" />
          <feMerge>
            <feMergeNode in="coloredBlur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      <motion.path
        d={path}
        fill="none"
        stroke={computedColor}
        strokeWidth={width}
        strokeLinecap="round"
        strokeLinejoin="round"
        initial={{ pathLength: 0 }}
        animate={{ pathLength: 1 }}
        transition={{ duration: 1 }}
      />

      {animated && (
        <motion.path
          d={path}
          fill="none"
          stroke={computedPulseColor}
          strokeWidth={width + 2}
          strokeLinecap="round"
          strokeLinejoin="round"
          filter="url(#traceGlow)"
          strokeDasharray={`${pathLength * 0.1} ${pathLength * 0.9}`}
          initial={{ strokeDashoffset: pathLength }}
          animate={{ strokeDashoffset: -pathLength }}
          transition={{
            duration: pulseSpeed,
            repeat: Infinity,
            ease: "linear",
          }}
        />
      )}
    </svg>
  );
}

export {
  CircuitBoard,
  CircuitPattern,
  CircuitNode,
  CircuitTrace,
  type CircuitNode as CircuitNodeType,
  type CircuitConnection,
  type CircuitBoardProps,
};

export default CircuitBoard;
