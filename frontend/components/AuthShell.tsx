import { Logo } from "@/components/kit";

// Two-panel frame for sign-in screens: form on the left, a quiet map of Lusaka on the right
// echoing the marketplace the person is about to enter.
export function AuthShell({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex min-h-dvh items-stretch justify-center p-0 sm:p-6">
      <div className="canvas grid w-full max-w-6xl overflow-hidden lg:grid-cols-[1fr_1.05fr]">
        <div className="flex flex-col px-6 py-8 sm:px-12 sm:py-10">
          <Logo />
          <div className="flex flex-1 items-center py-10">
            <div className="w-full max-w-sm">{children}</div>
          </div>
          <p className="text-[13px] text-muted-ink">Homes, short stays and student rooms across Zambia.</p>
        </div>
        <MapPanel />
      </div>
    </main>
  );
}

const PINS = [
  { x: 118, y: 120, n: 12, label: "Kabulonga" },
  { x: 300, y: 92, n: 4, label: "Roma" },
  { x: 236, y: 236, n: 28, label: "Woodlands" },
  { x: 400, y: 214, n: 7, label: "Kalingalinga" },
  { x: 150, y: 352, n: 9, label: "Makeni" },
  { x: 372, y: 382, n: 3, label: "Ibex Hill" },
];

function MapPanel() {
  return (
    <div className="relative hidden overflow-hidden bg-[#eaf1f7] lg:block" aria-hidden>
      <svg viewBox="0 0 520 520" preserveAspectRatio="xMidYMid slice" className="absolute inset-0 h-full w-full">
        <rect width="520" height="520" fill="#edf2f6" />
        <path d="M0 330 C120 300 160 380 260 360 S430 300 520 340 V520 H0Z" fill="#dcebd7" />
        <path d="M330 0 C350 90 300 140 340 220 S470 300 520 260 V0Z" fill="#e2efdc" />
        <path d="M-10 180 C80 200 140 150 230 170 S400 240 530 200" fill="none" stroke="#b9d7f2" strokeWidth="14" strokeLinecap="round" />
        {[
          "M40 0 L120 520",
          "M210 0 L180 520",
          "M0 270 L520 250",
          "M0 70 L520 120",
          "M310 0 L470 520",
          "M0 440 L520 410",
        ].map((d) => (
          <path key={d} d={d} stroke="#ffffff" strokeWidth="7" />
        ))}
        {["M70 0 L60 520", "M0 150 L520 175", "M260 0 L260 520", "M420 0 L380 520", "M0 380 L520 330"].map((d) => (
          <path key={d} d={d} stroke="#f6d27a" strokeWidth="3" opacity="0.9" />
        ))}
        {PINS.map((p) => (
          <g key={p.label}>
            <circle cx={p.x} cy={p.y} r={p.n > 9 ? 24 : 20} fill="var(--marker)" opacity="0.18" />
            <circle cx={p.x} cy={p.y} r={p.n > 9 ? 15 : 13} fill="var(--marker)" stroke="#fff" strokeWidth="3" />
            <text x={p.x} y={p.y + 4} textAnchor="middle" fontSize="11" fontWeight="700" fill="#fff">
              {p.n}
            </text>
            <text x={p.x} y={p.y + (p.n > 9 ? 36 : 32)} textAnchor="middle" fontSize="11" fontWeight="600" fill="#344054">
              {p.label}
            </text>
          </g>
        ))}
      </svg>
      <div className="absolute inset-x-8 bottom-8 rounded-2xl border border-white/60 bg-white/85 p-5 backdrop-blur">
        <p className="text-[15px] font-bold text-ink">One account for everything on Nyumba</p>
        <p className="mt-1 text-sm text-muted-ink">
          Search and book places to live. When you&apos;re ready to rent out your own, apply to become a provider from the
          same account.
        </p>
      </div>
    </div>
  );
}
