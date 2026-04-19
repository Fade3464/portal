import React, { useEffect, useRef } from "react"
import { motion, useMotionValue, animate } from "framer-motion"

export function ElasticScroll({
  children,
  className = "",
  maxPull = 28,
  strength = 0.18,
  returnDelay = 48,
}: {
  children: React.ReactNode
  className?: string
  maxPull?: number
  strength?: number
  returnDelay?: number
}) {
  const ref = useRef<HTMLDivElement | null>(null)
  const y = useMotionValue(0)

  const springAnimRef = useRef<ReturnType<typeof animate> | null>(null)
  const idleTimerRef = useRef<number | null>(null)

  const stopSpring = () => {
    if (springAnimRef.current) {
      springAnimRef.current.stop()
      springAnimRef.current = null
    }
  }

  const scheduleSpringBack = () => {
    if (idleTimerRef.current) window.clearTimeout(idleTimerRef.current)

    idleTimerRef.current = window.setTimeout(() => {
      stopSpring()
      springAnimRef.current = animate(y, 0, {
        type: "spring",
        stiffness: 180,
        damping: 24,
        mass: 1.1,
        restDelta: 0.2,
      })
    }, returnDelay)
  }

  useEffect(() => {
    const el = ref.current
    if (!el) return

    const clamp = (v: number, min: number, max: number) =>
      Math.max(min, Math.min(max, v))
    const canNestedScroll = (target: EventTarget | null, deltaY: number) => {
      if (!(target instanceof HTMLElement)) {
        return false
      }

      let current: HTMLElement | null = target

      while (current && current !== el) {
        const style = window.getComputedStyle(current)
        const overflowY = style.overflowY
        const isScrollable =
          (overflowY === "auto" || overflowY === "scroll") &&
          current.scrollHeight > current.clientHeight

        if (isScrollable) {
          const canScrollUp = current.scrollTop > 0
          const canScrollDown =
            Math.ceil(current.scrollTop + current.clientHeight) < current.scrollHeight

          if ((deltaY < 0 && canScrollUp) || (deltaY > 0 && canScrollDown)) {
            return true
          }
        }

        current = current.parentElement
      }

      return false
    }
    const applyResistance = (current: number, nextDelta: number) => {
      const distance = Math.abs(current)
      const t = clamp(distance / maxPull, 0, 1)
      const resistance = Math.pow(1 - t, 2.4) * 0.82 + 0.08
      return nextDelta * resistance
    }

    const normalizeWheelMagnitude = (raw: number) => {
      const magnitude = Math.abs(raw)

      // Keep trackpads subtle while taming large mouse-wheel jumps.
      if (magnitude < 4) return magnitude * 0.7
      if (magnitude < 20) return magnitude * 0.5
      if (magnitude < 60) return 10 + (magnitude - 20) * 0.22
      return 18
    }

    const onWheel = (e: WheelEvent) => {
      if (canNestedScroll(e.target, e.deltaY)) {
        return
      }

      const atTop = el.scrollTop <= 0
      const atBottom =
        Math.ceil(el.scrollTop + el.clientHeight) >= el.scrollHeight

      const pullingDownAtTop = atTop && e.deltaY < 0
      const pullingUpAtBottom = atBottom && e.deltaY > 0

      if (!pullingDownAtTop && !pullingUpAtBottom) return

      // We need to prevent native "rubber band / bounce" or page scroll
      e.preventDefault()

      stopSpring()

      const raw = e.deltaY
      const direction = raw < 0 ? 1 : -1
      const magnitude = normalizeWheelMagnitude(raw)
      let delta = direction * magnitude * strength

      delta = applyResistance(y.get(), delta)

      const next = clamp(y.get() + delta, -maxPull, maxPull)
      springAnimRef.current = animate(y, next, {
        type: "tween",
        duration: 0.14,
        ease: [0.16, 1, 0.3, 1],
      })

      scheduleSpringBack()
    }

    el.addEventListener("wheel", onWheel, { passive: false })

    return () => {
      el.removeEventListener("wheel", onWheel as EventListener)
      if (idleTimerRef.current) window.clearTimeout(idleTimerRef.current)
      stopSpring()
    }
  }, [maxPull, strength, returnDelay, y])

  return (
    <div
      ref={ref}
      className={`h-full overflow-y-auto overscroll-none ${className}`}
    >
      <motion.div style={{ y, willChange: "transform" }}>{children}</motion.div>
    </div>
  )
}
