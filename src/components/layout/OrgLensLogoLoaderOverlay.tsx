import React from 'react';
import { AnimatePresence, motion } from 'motion/react';

interface OrgLensLogoLoaderOverlayProps {
  visible: boolean;
  subtitle?: string;
}

/**
 * White translucent overlay displayed on top of the active workspace dashboard
 * while initial directory & workspace state finishes loading after sign-in.
 * Dismantles the 6 core shapes of /public/icon.svg outward and reassembles them
 * cleanly in a smooth continuous loop.
 */
export const OrgLensLogoLoaderOverlay: React.FC<
  OrgLensLogoLoaderOverlayProps
> = ({
  visible,
  subtitle = 'Preparing workspace & worldwide directory',
}) => {
  const loopTransition = (delay = 0) => ({
    duration: 2.2,
    repeat: Infinity,
    ease: [0.22, 1, 0.36, 1] as const,
    times: [0, 0.24, 0.5, 0.78, 1],
    delay,
  });

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          role="status"
          aria-live="polite"
          aria-label="Loading OrgLens workspace"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.28, ease: 'easeOut' }}
          className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-white/82 backdrop-blur-md select-none"
        >
          <div className="relative flex flex-col items-center justify-center gap-5 px-6">
            {/* Subtle halo behind dismantling logo */}
            <motion.div
              aria-hidden="true"
              animate={{
                scale: [0.92, 1.12, 0.94],
                opacity: [0.25, 0.55, 0.25],
              }}
              transition={{
                duration: 2.2,
                repeat: Infinity,
                ease: 'easeInOut',
              }}
              className="absolute -top-6 h-40 w-40 rounded-full bg-sky-400/20 blur-2xl pointer-events-none"
            />

            {/* Expanded viewBox (-32 to 160) gives room for logo pieces to dismantle outward cleanly */}
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="-32 -32 192 192"
              fill="none"
              className="relative h-32 w-32 drop-shadow-[0_14px_30px_rgba(15,23,42,0.16)] overflow-visible"
            >
              {/* 1. Outer Dark Navy Tile */}
              <motion.rect
                width="128"
                height="128"
                rx="28"
                fill="#0F172A"
                style={{ originX: '64px', originY: '64px' }}
                animate={{
                  scale: [1, 0.88, 0.88, 1, 1],
                  rotate: [0, -8, -8, 0, 0],
                  y: [0, 6, 6, 0, 0],
                }}
                transition={loopTransition(0)}
              />

              {/* 2. Inner Sky Telemetry Rim */}
              <motion.rect
                x="8"
                y="8"
                width="112"
                height="112"
                rx="22"
                stroke="#38BDF8"
                strokeOpacity="0.45"
                strokeWidth="2.5"
                style={{ originX: '64px', originY: '64px' }}
                animate={{
                  scale: [1, 1.18, 1.18, 1, 1],
                  rotate: [0, 9, 9, 0, 0],
                  strokeOpacity: [0.32, 0.78, 0.78, 0.32, 0.32],
                }}
                transition={loopTransition(0.03)}
              />

              {/* 3. Magnifying Lens Ring */}
              <motion.circle
                cx="58"
                cy="56"
                r="24"
                stroke="#38BDF8"
                strokeWidth="7"
                style={{ originX: '58px', originY: '56px' }}
                animate={{
                  x: [0, -22, -22, 0, 0],
                  y: [0, -18, -18, 0, 0],
                  rotate: [0, -28, -28, 0, 0],
                  scale: [1, 1.08, 1.08, 1, 1],
                }}
                transition={loopTransition(0.05)}
              />

              {/* 4. Diagonal Lens Handle */}
              <motion.path
                d="M76 74L96 94"
                stroke="#38BDF8"
                strokeWidth="7"
                strokeLinecap="round"
                style={{ originX: '86px', originY: '84px' }}
                animate={{
                  x: [0, 24, 24, 0, 0],
                  y: [0, 22, 22, 0, 0],
                  rotate: [0, 24, 24, 0, 0],
                }}
                transition={loopTransition(0.08)}
              />

              {/* 5. Executive Head Silhouette */}
              <motion.circle
                cx="58"
                cy="50"
                r="6"
                fill="#F8FAFC"
                style={{ originX: '58px', originY: '50px' }}
                animate={{
                  x: [0, 14, 14, 0, 0],
                  y: [0, -24, -24, 0, 0],
                  scale: [1, 1.25, 1.25, 1, 1],
                }}
                transition={loopTransition(0.06)}
              />

              {/* 6. Executive Shoulders Arc */}
              <motion.path
                d="M46 66C48.5 60.5 52.8 58 58 58C63.2 58 67.5 60.5 70 66"
                stroke="#F8FAFC"
                strokeWidth="5"
                strokeLinecap="round"
                style={{ originX: '58px', originY: '62px' }}
                animate={{
                  x: [0, -16, -16, 0, 0],
                  y: [0, 22, 22, 0, 0],
                  rotate: [0, -12, -12, 0, 0],
                }}
                transition={loopTransition(0.09)}
              />
            </svg>

            <div className="flex flex-col items-center text-center space-y-1.5">
              <div className="flex items-center gap-1.5 font-display text-lg font-bold tracking-tight text-slate-900">
                <span>Loading OrgLens</span>
                <motion.span
                  animate={{ opacity: [0.2, 1, 0.2] }}
                  transition={{ duration: 1.2, repeat: Infinity }}
                  className="text-sky-600"
                >
                  ...
                </motion.span>
              </div>
              <p className="text-xs font-medium text-slate-600">
                {subtitle}
              </p>

              {/* Sleek indeterminate sky progress rail */}
              <div className="mt-2 h-1 w-44 overflow-hidden rounded-full bg-slate-200">
                <motion.div
                  animate={{ x: ['-100%', '220%'] }}
                  transition={{
                    duration: 1.35,
                    repeat: Infinity,
                    ease: 'easeInOut',
                  }}
                  className="h-full w-1/2 rounded-full bg-gradient-to-r from-sky-400 via-sky-600 to-sky-400"
                />
              </div>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
