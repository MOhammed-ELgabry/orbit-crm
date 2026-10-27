import { useLayoutEffect, useRef } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";

import { gsap } from "../../lib/gsapMotion";
import { prefersReducedMotion } from "../../lib/motionPreference";
import { buttonClass } from "../../Components/ui/styles";

/**
 * MY ERP placeholder: a "COMING SOON" sign hanging from two ropes. There is
 * deliberately no data, API call or ERP content here — only the scene.
 *
 * The ropes run up past the top of the scene (which clips them), so the sign
 * reads as hung from the ceiling. On mount the whole rig is lowered into the
 * centre of the page with a soft overshoot, then swings like a pendulum about
 * its anchor at the top of the scene until it comes to rest. transform/opacity
 * only; reverted on unmount; skipped for reduced motion, where the rig simply
 * appears in its resting place.
 */
export default function MyErpPage() {
  const { t } = useTranslation();
  const sceneRef = useRef<HTMLElement>(null);
  const rigRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const scene = sceneRef.current;
    const rig = rigRef.current;

    if (!scene || !rig || prefersReducedMotion()) {
      return undefined;
    }

    const context = gsap.context(() => {
      // Pivot: the top edge of the scene, where the ropes disappear.
      const pivot = Math.max(
        0,
        rig.getBoundingClientRect().top - scene.getBoundingClientRect().top,
      );
      const drop = pivot + rig.offsetHeight + 40;

      gsap.set(rig, { transformOrigin: `50% -${pivot}px` });

      const timeline = gsap.timeline({
        onComplete: () => {
          gsap.set(rig, { clearProps: "transform,transformOrigin" });
        },
      });

      timeline
        .fromTo(
          rig,
          { y: -drop },
          { y: 0, duration: 1.1, ease: "back.out(1.25)" },
          0,
        )
        .fromTo(
          rig,
          { rotation: 3.5 },
          { rotation: 0, duration: 2.4, ease: "elastic.out(1, 0.3)" },
          0.55,
        );
    }, scene);

    return () => context.revert();
  }, []);

  return (
    <section
      ref={sceneRef}
      data-testid="my-erp-scene"
      className="relative flex min-h-[calc(100vh-11rem)] flex-col items-center justify-center gap-10 overflow-hidden px-4 py-10"
    >
      {/* The fixed rail the ropes are tied to; it never moves. */}
      <span
        aria-hidden="true"
        className="absolute start-1/2 top-0 z-10 h-2.5 w-[min(94%,590px)] -translate-x-1/2 rounded-b-full bg-brand-700 rtl:translate-x-1/2"
      />

      <div
        ref={rigRef}
        data-testid="my-erp-rig"
        className="relative w-[min(86vw,520px)]"
      >
        {/* Two ropes from above the scene down to the sign's top corners. */}
        <span
          aria-hidden="true"
          className="orbit-erp-rope absolute bottom-[calc(100%-6px)] start-[16%] h-[100vh] w-[5px] rounded-full"
        />
        <span
          aria-hidden="true"
          className="orbit-erp-rope absolute bottom-[calc(100%-6px)] end-[16%] h-[100vh] w-[5px] rounded-full"
        />

        <div className="relative rounded-2xl border-4 border-brand-700 bg-white px-6 py-10 text-center shadow-card-hover sm:py-14">
          <span
            aria-hidden="true"
            className="absolute start-[16%] top-2 h-3 w-3 -translate-x-[3px] rounded-full bg-brand-700 rtl:translate-x-[3px]"
          />
          <span
            aria-hidden="true"
            className="absolute end-[16%] top-2 h-3 w-3 translate-x-[3px] rounded-full bg-brand-700 rtl:-translate-x-[3px]"
          />

          <p
            dir="ltr"
            lang="en"
            className="font-nunito text-[28px] font-extrabold leading-tight tracking-[0.14em] text-brand-700 sm:text-[42px]"
          >
            COMING SOON
          </p>
        </div>
      </div>

      <Link
        to="/dashboard"
        data-testid="my-erp-back"
        className={buttonClass("secondary", "md")}
      >
        {t("myErpBack")}
      </Link>
    </section>
  );
}
