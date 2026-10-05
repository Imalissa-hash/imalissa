"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { cn } from "@/lib/utils";

interface Tab {
  key: string;
  label: string;
  content: React.ReactNode;
}

/**
 * PDP tabs: Description / Specifications / Shipping / Returns.
 * Animated underline indicator; accordion on mobile.
 */
export function ProductTabs({ tabs }: { tabs: Tab[] }) {
  const [active, setActive] = useState(tabs[0]?.key);
  const [openAccordion, setOpenAccordion] = useState<string | null>(null);

  const activeTab = tabs.find((t) => t.key === active) ?? tabs[0];

  return (
    <div>
      {/* Desktop tabs */}
      <div className="hidden border-b border-white/[0.08] sm:flex sm:gap-1">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActive(tab.key)}
            className={cn(
              "relative px-5 py-3.5 text-[0.88rem] font-medium transition",
              active === tab.key ? "text-gold-300" : "text-mist-400 hover:text-mist-200"
            )}
          >
            {tab.label}
            {active === tab.key && (
              <motion.span
                layoutId="tab-underline"
                className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-gradient-to-r from-gold-500 to-gold-700"
                transition={{ type: "spring", stiffness: 400, damping: 32 }}
              />
            )}
          </button>
        ))}
      </div>

      {/* Desktop content */}
      <div className="hidden py-6 sm:block">
        <AnimatePresence mode="wait">
          <motion.div
            key={active}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.25 }}
            className="text-[0.92rem] leading-relaxed text-mist-300"
          >
            {activeTab?.content}
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Mobile accordion */}
      <div className="sm:hidden">
        {tabs.map((tab) => (
          <div key={tab.key} className="border-b border-white/[0.08]">
            <button
              onClick={() => setOpenAccordion(openAccordion === tab.key ? null : tab.key)}
              className="flex w-full items-center justify-between py-4 text-left text-[0.9rem] font-medium text-mist-200"
            >
              {tab.label}
              <ChevronDown
                size={16}
                className={cn(
                  "text-gold-500 transition-transform",
                  openAccordion === tab.key && "rotate-180"
                )}
              />
            </button>
            <AnimatePresence initial={false}>
              {openAccordion === tab.key && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.25 }}
                  className="overflow-hidden"
                >
                  <div className="pb-4 text-[0.88rem] leading-relaxed text-mist-300">
                    {tab.content}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        ))}
      </div>
    </div>
  );
}
