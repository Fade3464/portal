import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";

export default function TopLoadingBar({ loading }: { loading: boolean }) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    let timeout: ReturnType<typeof setTimeout>;

    if (loading) {
      setVisible(true);
    } else {
      timeout = setTimeout(() => setVisible(false), 300);
    }

    return () => {
      if (timeout) clearTimeout(timeout);
    };
  }, [loading]);

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: "100%" }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.8, ease: "easeInOut" }}
          className="fixed top-0 left-0 h-[3px] bg-primary z-50 shadow"
        />
      )}
    </AnimatePresence>
  );
}