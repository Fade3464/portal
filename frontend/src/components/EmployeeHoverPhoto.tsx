"use client";

import { useRef, useState } from "react";
import { createPortal } from "react-dom";

interface Props {
  employeeId: number;
  children: React.ReactNode;
}

export default function EmployeeHoverPhoto({ employeeId, children }: Props) {
  const [photo, setPhoto] = useState<string | null>(null);
  const [show, setShow] = useState(false);
  const [pos, setPos] = useState({ x: 0, y: 0 });

  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleEnter = (e: React.MouseEvent) => {
    setPos({ x: e.clientX, y: e.clientY });

    timer.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/empdetails/${employeeId}/photo/`, {
          credentials: "include",
        });

        const data = await res.json();

        if (data.photo) {
          setPhoto(data.photo);
          setShow(true);
        }
      } catch (err) {
        console.error(err);
      }
    }, 1500);
  };

  const handleMove = (e: React.MouseEvent) => {
    setPos({ x: e.clientX, y: e.clientY });
  };

  const handleLeave = () => {
    if (timer.current) clearTimeout(timer.current);
    setShow(false);
  };

  return (
    <>
      <span
        onMouseEnter={handleEnter}
        onMouseMove={handleMove}
        onMouseLeave={handleLeave}
        className="cursor-pointer hover:underline"
      >
        {children}
      </span>

      {show &&
        photo &&
        typeof window !== "undefined" &&
        createPortal(
          <div
            style={{
                position: "fixed",
                top: pos.y - 110,
                left: pos.x - 60,
                zIndex: 999999,
                pointerEvents: "none",
            }}
            >
            <img
                src={photo}
                style={{
                width: 240,
                height: 240,
                borderRadius: "50%",
                objectFit: "cover",
                border: "3px solid white",
                boxShadow: "0 10px 28px rgba(0,0,0,0.4)",
                background: "white",
                }}
            />
            </div>,
          document.body
        )}
    </>
  );
}