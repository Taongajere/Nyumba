"""Builds NYUMBA_SYSTEM_UPGRADE_REPORT.pdf.

    python docs/report/build_report.py

Inputs (all in docs/report/): screenshots/*.png, test_results.txt, changed_files.txt.
"""

from datetime import date
from pathlib import Path

from reportlab.graphics.shapes import Drawing, Line, Polygon, Rect, String
from reportlab.lib import colors
from reportlab.lib.enums import TA_LEFT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import (
    Image,
    KeepTogether,
    PageBreak,
    Paragraph,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)

HERE = Path(__file__).parent
ROOT = HERE.parent.parent
OUT = ROOT / "NYUMBA_SYSTEM_UPGRADE_REPORT.pdf"
SHOTS = HERE / "screenshots"

NAVY = colors.HexColor("#0f1d33")
BLUE = colors.HexColor("#2160e8")
INK = colors.HexColor("#101828")
MUTED = colors.HexColor("#667085")
LINE = colors.HexColor("#e6e8ec")
SUBTLE = colors.HexColor("#f5f6f8")
GREEN = colors.HexColor("#067647")
GREEN_SOFT = colors.HexColor("#ecfdf3")
AMBER = colors.HexColor("#b54708")
AMBER_SOFT = colors.HexColor("#fffaeb")
RED = colors.HexColor("#b42318")
RED_SOFT = colors.HexColor("#fef3f2")
BLUE_SOFT = colors.HexColor("#eff4ff")

PAGE_W, PAGE_H = A4
CONTENT_W = PAGE_W - 36 * mm

ss = getSampleStyleSheet()
S = {
    "title": ParagraphStyle("t", parent=ss["Title"], fontName="Helvetica-Bold", fontSize=26, leading=31, textColor=INK, alignment=TA_LEFT, spaceAfter=6),
    "subtitle": ParagraphStyle("st", parent=ss["Normal"], fontSize=12, leading=17, textColor=MUTED),
    "h1": ParagraphStyle("h1", parent=ss["Heading1"], fontName="Helvetica-Bold", fontSize=17, leading=21, textColor=INK, spaceBefore=4, spaceAfter=8),
    "h2": ParagraphStyle("h2", parent=ss["Heading2"], fontName="Helvetica-Bold", fontSize=12.5, leading=16, textColor=INK, spaceBefore=10, spaceAfter=4),
    "body": ParagraphStyle("b", parent=ss["Normal"], fontName="Helvetica", fontSize=9.6, leading=14, textColor=INK, spaceAfter=5),
    "small": ParagraphStyle("s", parent=ss["Normal"], fontName="Helvetica", fontSize=8.2, leading=11, textColor=MUTED),
    "cell": ParagraphStyle("c", parent=ss["Normal"], fontName="Helvetica", fontSize=8.4, leading=11, textColor=INK),
    "cellb": ParagraphStyle("cb", parent=ss["Normal"], fontName="Helvetica-Bold", fontSize=8.4, leading=11, textColor=INK),
    "mono": ParagraphStyle("m", parent=ss["Normal"], fontName="Courier", fontSize=7.6, leading=9.6, textColor=INK),
    "caption": ParagraphStyle("cap", parent=ss["Normal"], fontName="Helvetica-Oblique", fontSize=8.2, leading=11, textColor=MUTED, spaceAfter=10),
    "bullet": ParagraphStyle("bl", parent=ss["Normal"], fontName="Helvetica", fontSize=9.6, leading=13.5, textColor=INK, leftIndent=12, bulletIndent=2, spaceAfter=2),
}

STATUS = {
    "done": ("Completed", GREEN, GREEN_SOFT),
    "partial": ("Partial", AMBER, AMBER_SOFT),
    "todo": ("Outstanding", RED, RED_SOFT),
}


def p(text, style="body"):
    return Paragraph(text, S[style])


def bullets(items):
    return [Paragraph(i, S["bullet"], bulletText="•") for i in items]


def table(rows, widths, header=True, zebra=True):
    data = [[c if not isinstance(c, str) else Paragraph(c, S["cellb" if header and r == 0 else "cell"]) for c in row] for r, row in enumerate(rows)]
    t = Table(data, colWidths=widths, repeatRows=1 if header else 0)
    style = [
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LINEBELOW", (0, 0), (-1, -1), 0.4, LINE),
        ("TOPPADDING", (0, 0), (-1, -1), 4),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
        ("LEFTPADDING", (0, 0), (-1, -1), 5),
        ("RIGHTPADDING", (0, 0), (-1, -1), 5),
    ]
    if header:
        style += [("BACKGROUND", (0, 0), (-1, 0), SUBTLE)]
    t.setStyle(TableStyle(style))
    return t


def status_table(rows):
    """rows: (feature, status key, note)"""
    out = [["Feature", "Status", "Notes"]]
    styles = []
    for i, (feature, key, note) in enumerate(rows, start=1):
        label, fg, bg = STATUS[key]
        out.append([feature, Paragraph(f'<font color="{fg.hexval()}"><b>{label}</b></font>', S["cell"]), note])
        styles.append(("BACKGROUND", (1, i), (1, i), bg))
    t = table(out, [55 * mm, 22 * mm, CONTENT_W - 77 * mm])
    t.setStyle(TableStyle(styles))
    return t


def shot(name, caption, width=CONTENT_W):
    path = SHOTS / f"{name}.png"
    if not path.exists():
        return [p(f"(Screenshot {name} missing)", "small")]
    img = Image(str(path))
    ratio = img.imageHeight / img.imageWidth
    img.drawWidth = width
    img.drawHeight = width * ratio
    max_h = 150 * mm
    if img.drawHeight > max_h:
        img.drawHeight = max_h
        img.drawWidth = max_h / ratio
    return [KeepTogether([img, Spacer(1, 3), p(caption, "caption")])]


# ---------------------------------------------------------------------------
# Diagrams
# ---------------------------------------------------------------------------
def box(d, x, y, w, h, title, sub="", fill=colors.white, stroke=NAVY, tcolor=INK):
    d.add(Rect(x, y, w, h, rx=6, ry=6, fillColor=fill, strokeColor=stroke, strokeWidth=0.9))
    lines = sub.split("\n") if sub else []
    block = 10 + 9 * len(lines)
    top = y + h / 2 + block / 2 - 8  # title baseline; title + lines centred as one block
    d.add(String(x + w / 2, top, title, fontName="Helvetica-Bold", fontSize=8.4, fillColor=tcolor, textAnchor="middle"))
    for i, line in enumerate(lines):
        d.add(String(x + w / 2, top - 11 - i * 9, line, fontName="Helvetica", fontSize=6.8, fillColor=MUTED, textAnchor="middle"))


def arrow(d, x1, y1, x2, y2, label="", color=MUTED, label_dy=4):
    d.add(Line(x1, y1, x2, y2, strokeColor=color, strokeWidth=0.9))
    import math

    a = math.atan2(y2 - y1, x2 - x1)
    s = 5
    d.add(Polygon([x2, y2, x2 - s * math.cos(a - 0.4), y2 - s * math.sin(a - 0.4), x2 - s * math.cos(a + 0.4), y2 - s * math.sin(a + 0.4)], fillColor=color, strokeColor=color))
    if label:
        d.add(String((x1 + x2) / 2, (y1 + y2) / 2 + label_dy, label, fontName="Helvetica", fontSize=6.6, fillColor=MUTED, textAnchor="middle"))


def architecture_diagram():
    w, h = CONTENT_W, 150
    d = Drawing(w, h)
    col = w / 4
    bw = col - 28
    box(d, 0, 98, bw, 44, "Web browser", "Next.js pages\n(React, Tailwind)", fill=BLUE_SOFT, stroke=BLUE)
    box(d, 0, 40, bw, 44, "Flutter apps", "Android / iOS\n(future)", fill=SUBTLE, stroke=MUTED)
    box(d, col, 72, bw, 70, "Next.js server", "proxy.ts route gate\n/api/auth/* sets cookie\n/api/backend/* adds token", fill=colors.white)
    box(d, 2 * col, 4, bw, 138, "Django + DRF", "accounts, provider approval\nmarketplace search\nbookings, availability\npayments, commission\nboarding occupancy\nadmin, notifications", fill=colors.white)
    box(d, 3 * col, 98, bw, 44, "PostgreSQL", "DATABASE_URL\n(SQLite in dev/tests)", fill=SUBTLE)
    box(d, 3 * col, 51, bw, 44, "Flutterwave", "checkout, verify,\nwebhooks, refunds", fill=AMBER_SOFT, stroke=AMBER)
    box(d, 3 * col, 4, bw, 44, "Media storage", "property photos\n(MEDIA_ROOT)", fill=SUBTLE)
    arrow(d, bw, 120, col, 120, "HTTPS")
    arrow(d, bw, 60, 2 * col, 60, "token API (direct)")
    arrow(d, col + bw, 100, 2 * col, 100, "REST")
    arrow(d, 2 * col + bw, 120, 3 * col, 120, "ORM")
    arrow(d, 2 * col + bw, 80, 3 * col, 80, "verify")
    arrow(d, 3 * col, 64, 2 * col + bw, 64, "webhook", label_dy=-9)
    arrow(d, 2 * col + bw, 26, 3 * col, 26, "files")
    return d


def auth_diagram():
    w, h = CONTENT_W, 118
    d = Drawing(w, h)
    steps = [
        ("Open any page", "proxy.ts checks\nthe session cookie"),
        ("/login", "username or email\n+ password"),
        ("Sign-in request", "Next.js route\nforwards to Django"),
        ("Django checks", "PBKDF2 hash,\n10 tries/min per IP"),
        ("Token issued", "stored in httpOnly\nSameSite cookie"),
        ("App loads /me", "provider status,\nactive mode, admin"),
    ]
    bw = (w - 5 * 10) / 6
    for i, (t, s) in enumerate(steps):
        x = i * (bw + 10)
        box(d, x, h - 50, bw, 44, t, s, fill=BLUE_SOFT if i in (0, 5) else colors.white)
        if i:
            arrow(d, x - 10, h - 28, x, h - 28)
    box(d, 0, 6, w / 2 - 6, 40, "Logout / password change / reset", "token deleted server-side; reset links signed,\nexpire in 2 hours, sign out every device", fill=SUBTLE)
    box(d, w / 2 + 6, 6, w / 2 - 6, 40, "Every API call", "DRF TokenAuthentication + IsAuthenticated by default;\nsuspended accounts (is_active=False) get 401", fill=SUBTLE)
    return d


def roles_diagram():
    w, h = CONTENT_W, 200
    d = Drawing(w, h)
    box(d, w / 2 - 70, h - 34, 140, 28, "One Nyumba account", "User + UserProfile", fill=BLUE_SOFT, stroke=BLUE)
    states = [("none", "General user"), ("pending", "Applied"), ("approved", "Provider"), ("rejected", "Rejected"), ("suspended", "Suspended")]
    bw = (w - 4 * 10) / 5
    for i, (k, label) in enumerate(states):
        x = i * (bw + 10)
        fill = {"approved": GREEN_SOFT, "rejected": RED_SOFT, "suspended": RED_SOFT, "pending": AMBER_SOFT}.get(k, colors.white)
        box(d, x, h - 92, bw, 32, label, f"provider_status = {k}", fill=fill)
        arrow(d, w / 2, h - 34, x + bw / 2, h - 60)
    box(d, 0, 8, w / 2 - 6, 40, "Marketplace (all states)", "search, favourites, enquiries, bookings,\npayments, notifications, profile", fill=SUBTLE)
    box(d, w / 2 + 6, 8, w / 2 - 6, 40, "Provider tools (approved only)", "properties, boarding houses, occupants,\nbookings, earnings, analytics; switch any time", fill=GREEN_SOFT, stroke=GREEN)
    d.add(String(w / 2, 54, "Admin role = user.is_staff (separate dashboard)", fontName="Helvetica-Oblique", fontSize=7, fillColor=MUTED, textAnchor="middle"))
    return d


def er_diagram():
    w, h = CONTENT_W, 222
    d = Drawing(w, h)
    bw, bh = 82, 26
    pos = {
        "User": (6, h - 34),
        "UserProfile": (6, h - 74),
        "ProviderApplication": (6, h - 114),
        "ProviderProfile": (6, h - 154),
        "Property": (120, h - 34),
        "PropertyImage": (120, h - 74),
        "PropertyUnit": (120, h - 114),
        "Listing": (234, h - 34),
        "BoardingHouse": (234, h - 114),
        "BoardingRoom": (234, h - 154),
        "BoardingTenancy": (234, h - 194),
        "Booking": (348, h - 74),
        "Commission": (348, h - 114),
        "Payment": (348, h - 154),
        "Refund": (348, h - 194),
        "Favourite": (120, h - 154),
        "Inquiry": (120, h - 194),
        "Notification": (6, h - 194),
        "Review": (348, h - 34),
        "ProviderPayout": (434, h - 114),
        "CommissionRate": (434, h - 154),
        "ListingReport": (434, h - 194),
    }
    for name, (x, y) in pos.items():
        fill = BLUE_SOFT if name in ("Booking", "Payment", "Commission") else GREEN_SOFT if name.startswith("Boarding") else colors.white
        box(d, x, y, bw if x < 430 else 74, bh, name, fill=fill)

    def link(a, b, label=""):
        ax, ay = pos[a]
        bx, by = pos[b]
        arrow(d, ax + bw / 2, ay if by < ay else ay + bh, bx + bw / 2 if bx < 430 else bx + 37, by + bh if by < ay else by, label)

    link("User", "UserProfile", "1:1")
    link("UserProfile", "ProviderApplication")
    link("ProviderApplication", "ProviderProfile")
    link("Property", "PropertyImage", "1:n")
    link("PropertyImage", "PropertyUnit")
    link("Listing", "BoardingHouse")
    link("BoardingHouse", "BoardingRoom", "1:n")
    link("BoardingRoom", "BoardingTenancy", "1:n")
    link("Booking", "Commission", "1:1")
    link("Commission", "Payment")
    link("Payment", "Refund", "1:n")
    arrow(d, 6 + bw, h - 21, 120, h - 21, "owns")
    arrow(d, 120 + bw, h - 21, 234, h - 21, "1:n")
    arrow(d, 234 + bw, h - 21, 348, h - 61, "")
    arrow(d, 234 + bw, h - 141, 348, h - 61, "")
    d.add(String(w - 4, 6, "Booking targets exactly one Listing OR one BoardingRoom (DB check constraint).", fontName="Helvetica-Oblique", fontSize=6.8, fillColor=MUTED, textAnchor="end"))
    return d


def booking_diagram():
    w, h = CONTENT_W, 58 * mm
    d = Drawing(w, h)
    bw = (w - 5 * 12) / 6
    req = ["pending", "awaiting_payment", "confirmed", "completed"]
    xs = [0, bw + 12, 2 * (bw + 12), 3 * (bw + 12)]
    for x, s in zip(xs, req):
        box(d, x, h - 34, bw, 26, s, fill=GREEN_SOFT if s == "confirmed" else colors.white)
    arrow(d, xs[0] + bw, h - 21, xs[1], h - 21, "provider accepts")
    arrow(d, xs[1] + bw, h - 21, xs[2], h - 21, "payment verified")
    arrow(d, xs[2] + bw, h - 21, xs[3], h - 21, "stay ends / check-out")
    box(d, 4 * (bw + 12), h - 34, bw, 26, "rejected", fill=RED_SOFT)
    box(d, 5 * (bw + 12), h - 34, bw, 26, "cancelled", "guest, provider\nor expired hold", fill=SUBTLE)
    d.add(String(0, h - 50, "Request mode starts at pending.  Instant mode starts at awaiting_payment after an availability check (30-minute hold).", fontName="Helvetica", fontSize=7.4, fillColor=INK))
    d.add(String(0, h - 62, "awaiting_payment holds dates/beds until payment_due_at; confirmed holds them; pending does not (conflicts re-checked at acceptance).", fontName="Helvetica", fontSize=7.4, fillColor=INK))
    d.add(String(0, h - 74, "Every transition runs in a database transaction with the listing or room row locked (SELECT ... FOR UPDATE) to stop double booking.", fontName="Helvetica", fontSize=7.4, fillColor=INK))
    return d


def payment_diagram():
    w, h = CONTENT_W, 80
    d = Drawing(w, h)
    steps = [
        ("Pay now", "guest presses Pay;\nbooking must be held"),
        ("Payment row", "tx_ref, amount from\nbooking (server)"),
        ("Checkout", "Flutterwave page:\ncard or mobile money"),
        ("Return + webhook", "browser returns;\nwebhook is signed"),
        ("Server verify", "gateway verify API:\namount, currency, ref"),
        ("Confirm", "booking confirmed,\ncommission earned,\nbed reserved"),
    ]
    bw = (w - 5 * 10) / 6
    for i, (t, s) in enumerate(steps):
        x = i * (bw + 10)
        box(d, x, h - 58, bw, 54, t, s, fill=GREEN_SOFT if i == 5 else AMBER_SOFT if i == 2 else colors.white)
        if i:
            arrow(d, x - 10, h - 31, x, h - 31)
    d.add(String(0, 6, "Idempotent: a payment already settled is never processed again; a gateway transaction id can be used only once.", fontName="Helvetica", fontSize=7.4, fillColor=INK))
    return d


# ---------------------------------------------------------------------------
def on_page(canvas, doc):
    canvas.saveState()
    canvas.setFont("Helvetica", 7.5)
    canvas.setFillColor(MUTED)
    canvas.drawString(18 * mm, 10 * mm, "Nyumba system upgrade report")
    canvas.drawRightString(PAGE_W - 18 * mm, 10 * mm, f"Page {doc.page}")
    canvas.setStrokeColor(LINE)
    canvas.line(18 * mm, 13 * mm, PAGE_W - 18 * mm, 13 * mm)
    canvas.restoreState()


def build():
    story = []
    tests = (HERE / "test_results.txt").read_text(encoding="utf-8").strip().splitlines()
    passed = sum(1 for t in tests if t.endswith(" ok"))
    changed = [l.split("\t") if "\t" in l else l.split(" ", 1) for l in (HERE / "changed_files.txt").read_text(encoding="utf-8").splitlines() if l.strip()]

    # Cover -------------------------------------------------------------
    story += [
        Spacer(1, 40 * mm),
        p("NYUMBA", "subtitle"),
        p("System upgrade report", "title"),
        p("Platform redesign, authentication, provider approval, boarding-house management, bookings, online payments and administration", "subtitle"),
        Spacer(1, 14 * mm),
        table(
            [
                ["Date", date(2026, 11, 16).strftime("%d %B %Y")],
                ["Branch", "feat/platform-upgrade (not merged, not committed at time of writing)"],
                ["Stack", "Next.js 16 + TypeScript + Tailwind 4 / Django 6.1 + DRF 3.18 / PostgreSQL-ready"],
                ["Backend tests", f"{passed} of {len(tests)} passing"],
                ["Frontend checks", "TypeScript: no errors. ESLint: 0 errors (4 deliberate warnings). Production build: passes (42 routes)."],
            ],
            [35 * mm, CONTENT_W - 35 * mm],
            header=False,
        ),
        Spacer(1, 10 * mm),
        p(
            "<b>How to read status labels.</b> <font color='#067647'><b>Completed</b></font> means implemented and exercised by an automated test or an end-to-end run in the browser. "
            "<font color='#b54708'><b>Partial</b></font> means implemented but not fully exercised, or a reduced version of what the brief asks. "
            "<font color='#b42318'><b>Outstanding</b></font> means not done. Nothing is labelled Completed without having been run.",
        ),
        PageBreak(),
    ]

    # Summary
    story += [
        p("Summary", "h1"),
        p(
            "Nyumba started as a single Django app with token login, one role field, listings that admins approve, a single-capacity boarding-house model and a basic short-stay booking. "
            "It now has one account per person with an administrator-approved provider upgrade, a map-first marketplace that follows the supplied reference design, a separate student boarding-house experience, "
            "Property -> Rooms -> Occupants management with capacity enforced in the database layer, request-based and instant bookings with hold expiry, a payment layer built for Flutterwave with "
            "server-side verification, configurable commission, provider analytics and a full administrator dashboard."
        ),
        status_table(
            [
                ("Authentication (login, register, logout, reset)", "done", "httpOnly cookie session on web, token for mobile; tests + browser run."),
                ("One account, provider application and approval", "done", "Pending / approved / rejected / suspended, reapply rules; tests."),
                ("Account switching (marketplace / provider)", "done", "Stored server-side (active_mode) so web and mobile agree."),
                ("Frontend redesign to the reference", "done", "Map-first 55/45 split, pill filters, cluster markers, card style."),
                ("Provider dashboard and analytics", "done", "Filters by date and property; charts; earnings split."),
                ("Boarding-house management", "done", "Rooms, capacity, occupants, check-in/out, report; capacity tests."),
                ("Property management (photos, units, publish)", "done", "Upload validated as real images; units table."),
                ("General marketplace and filters", "done", "13 filters, map bounding box, URL state."),
                ("Student accommodation discovery", "done", "Only houses with free beds; room/sharing/price/gender filters."),
                ("Request and instant bookings", "done", "Double booking prevented under row locks; hold expiry."),
                ("Online payments (Flutterwave)", "partial", "Sandbox simulator tested end to end; live Flutterwave adapter written but not run without your test keys."),
                ("Commission and payouts", "done", "Per-category rates set by admin; payouts recorded manually."),
                ("Favourites", "done", "Database-backed, per user, listings and boarding houses."),
                ("Administrator dashboard", "done", "Users, applications, moderation, reports, finance, rates."),
                ("PostgreSQL / PostGIS", "partial", "Configurable via DATABASE_URL; all testing ran on SQLite. PostGIS not used (by decision)."),
                ("Flutter mobile apps", "todo", "Out of scope for this phase; API is ready for them."),
            ]
        ),
        PageBreak(),
    ]

    # 1 Original architecture
    story += [
        p("1. Original application architecture", "h1"),
        p("Audit of the code on <i>main</i> before this work (Phase 1):"),
        *bullets(
            [
                "<b>Backend:</b> one Django app (<i>apps.properties</i>) with a 1,034-line <i>api.py</i> of function views. Models: UserProfile (role provider/user, user_type student/general), Property, Listing, Inquiry, Booking, Commission, BoardingHouse (single capacity number), BoardingTenancy. 30 tests passing.",
                "<b>Auth:</b> DRF token returned to the browser and kept in <i>localStorage</i>; no logout endpoint, no password reset; the default DRF permission was AllowAny.",
                "<b>Roles:</b> a provider chose that role at sign-up; providers could post listings immediately while their verification was still pending. A student and a provider needed different accounts.",
                "<b>Bookings:</b> anonymous short-stay requests (name + phone) with a date-clash check; no payments; commission hard-coded at 10% in the view.",
                "<b>Boarding:</b> house-level capacity only, no rooms; tenancy approvals by username.",
                "<b>Frontend:</b> Next.js 16 with a green/gold theme, hard-coded <i>127.0.0.1:8000</i> URLs in pages, a client-only AuthGate, a MapLibre listings map, and a basic owner dashboard.",
                "<b>Database:</b> SQLite file; PostgreSQL 18 is installed on the development machine but not configured.",
            ]
        ),
        p("Issues fixed along the way", "h2"),
        *bullets(
            [
                "Unapproved providers could publish listings; anyone could create bookings without an account; commission was calculated in a view with a constant.",
                "Frontend stored the API token where page scripts could read it, and several pages called Django directly with hard-coded URLs.",
                "The test runner failed when pointed at the app package (the stray <i>backend/__init__.py</i> breaks discovery); tests run with <i>manage.py test apps.properties.tests</i>.",
            ]
        ),
        p("Target architecture", "h2"),
        architecture_diagram(),
        p("Figure 1. Runtime architecture after the upgrade.", "caption"),
        PageBreak(),
    ]

    # 2 Frontend redesign
    story += [
        p("2. Frontend redesign", "h1"),
        p(
            "The supplied screenshot was treated as the primary reference. Its visual system was translated into Nyumba tokens in <i>frontend/app/globals.css</i>: a cool grey page with one white rounded working canvas, "
            "navy-ink type and pill buttons (#0f1d33), blue map markers (#2160e8) with a soft halo, a red save heart, hairline borders (#e6e8ec) and 16 to 28 px radii. Typeface: Plus Jakarta Sans. "
            "The brand name, logo and content are Nyumba's own; only the visual direction follows the reference."
        ),
        *bullets(
            [
                "Header: logo, section links, favourites count pill, notification bell with unread dot, and a <i>Hi, Name</i> menu as in the reference.",
                "Search row: town chip + search box, then pill filters (Listing, Type, Beds, Baths, Price) with a clear (x) and chevron, and <i>More filters</i>.",
                "Map-first split: the map takes 55% of the width on desktop, listings 45% in two columns. Clusters show counts; single homes show a short price. Hovering a card highlights its marker and clicking a marker scrolls to its card. <i>Clear map boundary</i> toggles the bounding-box search.",
                "Cards: photo with heart and badge, area line and rating or verified pill, title, Bed/Bath/m² chips, navy <i>View details</i> pill and price.",
                "Mobile: list first with a floating <i>Show map</i> button; the map-area limit applies only while the map is visible.",
                "Provider and admin areas share a sidebar shell with the same tokens, tuned for management work rather than browsing.",
            ]
        ),
        *shot("02-explore-map", "Figure 2. Explore: the map-first marketplace following the reference layout (desktop, 1440 x 900)."),
        *shot("04-listing-detail", "Figure 3. Listing detail with gallery, facts and the booking box."),
        PageBreak(),
        *shot("03-properties-grid", "Figure 4. Properties: the same search in a list-first grid."),
        *shot("23-mobile-explore", "Figure 5. Explore on a phone (390 px wide).", width=60 * mm),
        PageBreak(),
    ]

    # 3 Authentication
    story += [
        p("3. Authentication workflow", "h1"),
        p(
            "Login is the first screen: <i>frontend/proxy.ts</i> (Next.js 16's renamed middleware) redirects every page to <i>/login</i> when there is no session cookie, and Django rejects every API call without a token "
            "(<i>DEFAULT_PERMISSION_CLASSES = IsAuthenticated</i>). Only login, registration, password reset and the payment webhook are open."
        ),
        auth_diagram(),
        p("Figure 6. Authentication flow.", "caption"),
        *bullets(
            [
                "<b>Secure password storage:</b> Django's PBKDF2 hasher and the four standard password validators (length, similarity, common, numeric).",
                "<b>Session on web:</b> <i>/api/auth/login</i> and <i>/register</i> route handlers put the Django token in an <i>httpOnly, SameSite=Lax</i> cookie (Secure in production). Browser code never sees it; <i>/api/backend/*</i> adds it to Django calls.",
                "<b>Session on mobile:</b> Flutter calls Django directly and sends <i>Authorization: Token ...</i>.",
                "<b>Logout</b> deletes the token server-side. <b>Password change</b> and <b>reset</b> also delete all tokens (signs out every device).",
                "<b>Password reset</b> uses Django's signed, time-limited tokens (2 hours); the request endpoint answers identically whether or not the email exists.",
                "<b>Rate limiting:</b> 10 requests/minute per IP on login, registration and reset; 240/minute per signed-in user elsewhere.",
                "<b>Suspended accounts</b> (is_active=False) are refused by token authentication immediately.",
            ]
        ),
        *shot("01-login", "Figure 7. Login screen."),
        PageBreak(),
    ]

    # 4 Account types / switching
    story += [
        p("4. Account types and account switching", "h1"),
        p(
            "There is one account per person. Every account is a general user. Provider capability is a separate, administrator-controlled layer (<i>ProviderProfile</i>), so a provider keeps the same favourites, bookings, "
            "payments and notifications. The chosen experience is stored on the server (<i>UserProfile.active_mode</i>) and changed with <i>POST /api/me/mode/</i>; only an approved, non-suspended provider can choose <i>provider</i>."
        ),
        roles_diagram(),
        p("Figure 8. Account states and what each can use.", "caption"),
        p(
            "Students are general users (your decision): institution, student number and emergency contact are optional profile fields, asked for when booking a bed and remembered for next time. The old student/general sub-type was removed in migration 0008.",
        ),
        p("Navigation adapts to the account", "h2"),
        table(
            [
                ["Experience", "Navigation"],
                ["General user", "Explore, Properties, Boarding houses, Favourites (heart pill), Notifications (bell), and under the user menu: My bookings, Payments, Profile, Settings, Apply to become a provider, Log out."],
                ["Approved provider", "Sidebar: Dashboard, Explore properties, My properties, Boarding houses, Tenants & occupants, Bookings & enquiries, Payments & earnings, Analytics, Favourites, Profile, Settings, Switch to marketplace, Log out."],
                ["Administrator", "Sidebar: Overview, Provider applications, Users, Listings, Reports, Finance, Commission & categories, Marketplace, Log out."],
            ],
            [35 * mm, CONTENT_W - 35 * mm],
        ),
        PageBreak(),
    ]

    # 5 Provider approval
    story += [
        p("5. Provider approval workflow", "h1"),
        *bullets(
            [
                "1. A signed-in user opens <i>Apply to become a provider</i> and submits type, business name, phone, town, optional PACRA number, number of places and a description.",
                "2. A <i>ProviderApplication</i> is created with status <b>pending</b>. A database constraint allows only one pending application per user. Administrators are notified.",
                "3. While pending, the user keeps full marketplace access; provider endpoints return 403 and the provider UI explains why.",
                "4. The administrator approves (creates or reactivates <i>ProviderProfile</i>, notifies the user) or rejects with a required reason and a <i>can reapply</i> switch.",
                "5. Rejected applicants see the reason and can reapply unless blocked. Suspension (with a required reason) hides all their listings and boarding houses from search and removes provider access until reinstated.",
            ]
        ),
        p("Existing providers were migrated as <b>pending</b> applications (their old verification status was unverified/pending), so their 16 older listings stay hidden until an administrator approves them. Three such applications are waiting in the admin dashboard.", "body"),
        *shot("10-become-provider", "Figure 9. The application page a general user sees."),
        *shot("19-admin-applications", "Figure 10. Administrator review queue."),
        PageBreak(),
    ]

    # 6 Provider dashboard
    story += [
        p("6. Provider dashboard", "h1"),
        p(
            "<i>GET /api/provider/dashboard/?from=&amp;to=&amp;property=</i> returns every figure the brief lists, computed on the server: total properties, active listings, occupied and available units (boarding beds plus "
            "individual units), tenants, booking requests, recent activity, rental income, net and gross revenue, monthly revenue for 12 months, occupancy rate, pending payments (unpaid bookings plus occupant balances) "
            "and booking performance (by status, acceptance rate, payment conversion). Charts follow a single-series style: one blue, rounded bars on a quiet grid, hover tooltips and a hidden data table for screen readers."
        ),
        *shot("12-provider-dashboard", "Figure 11. Provider dashboard with filters, stat tiles and charts."),
        *shot("15-provider-earnings", "Figure 12. Payments & earnings: each paid booking's split and the payout history."),
        PageBreak(),
        *shot("16-provider-analytics", "Figure 13. Analytics: gross value, paid bookings, earnings by type, occupancy by boarding house."),
        *shot("17-provider-properties", "Figure 14. My properties with listing review and publish states."),
        p(
            "Property management covers add, edit, photo upload (JPEG/PNG/WebP up to 5 MB, verified with Pillow so renamed files are rejected), publish and unpublish, availability date, booking mode, "
            "individual units with tenant and lease, and deletion (properties with booking history are unpublished instead, to keep financial records). Providers may only touch properties they own or "
            "are listed as managers of; anything else returns 404."
        ),
        PageBreak(),
    ]

    # 7 Boarding
    story += [
        p("7. Boarding-house management", "h1"),
        p(
            "The structure is <b>Property -> BoardingHouse -> BoardingRoom -> BoardingTenancy</b>. Each room has a fixed capacity (1 to 20, check constraint). Occupancy is never stored: it is counted from tenancy records "
            "every time it is shown."
        ),
        table(
            [
                ["Count", "Meaning"],
                ["occupied", "tenancies with status <i>active</i> (checked in)"],
                ["reserved", "tenancies with status <i>reserved</i> (paid booking or registered, not yet moved in)"],
                ["held", "bookings in <i>awaiting_payment</i> whose payment window is still open"],
                ["available", "capacity - occupied - reserved - held (never below 0)"],
            ],
            [30 * mm, CONTENT_W - 30 * mm],
        ),
        Spacer(1, 6),
        *bullets(
            [
                "Registering an occupant, accepting a room request and confirming a payment all lock the room row and re-check <i>available</i> inside a transaction, so a room can't exceed capacity even with simultaneous requests (test: three registrations for a one-bed room give 201, 409, 409).",
                "Capacity can't be lowered below beds taken or held.",
                "Walk-in occupants can be registered without a Nyumba account; linking a username lets the student see the placement too. A database constraint allows one open bed per account.",
                "Check-in moves reserved to active; check-out frees the bed and completes the linked booking.",
                "The printable occupancy report gives totals, per-room counts and occupant names, rent due, collected and outstanding, and 30-day movements.",
            ]
        ),
        *shot("14-provider-rooms", "Figure 15. Managing a house: Room 01 has capacity 4, 3 occupied, 1 free (the brief's example)."),
        *shot("13-provider-boarding", "Figure 16. All boarding houses with bed counts and per-room dots."),
        PageBreak(),
    ]

    # 8 + 9 Marketplace / students
    story += [
        p("8. General marketplace", "h1"),
        p(
            "<i>GET /api/listings/search/</i> serves only <i>Listing.public()</i>: approved by an administrator, published by the provider, and owned by an approved, non-suspended provider. Boarding houses are kept out of "
            "ordinary property results. Filters: map bounding box or town, free text, listing kind (rent, sale, short stay), property type, minimum bedrooms and bathrooms, price range, size range, furnishing, "
            "available-by date, amenities, instant booking only, verified only, and sort. All filters live in the URL, so a search can be shared or bookmarked. Results update as the map moves (debounced, stale requests cancelled)."
        ),
        p("9. Student accommodation", "h1"),
        p(
            "<i>/boarding-houses</i> is a separate experience on the same infrastructure. Search by town or by university/area text, filter by room type, shared or own room, price per bed and residents (mixed, female, male). "
            "Students only see houses with at least one free bed matching their filters; within a house only matching rooms with space are listed. The detail page shows each room's capacity as bed dots, amenities, "
            "rules, verification and provider, with booking per room and enquiries to the provider."
        ),
        *shot("05-boarding-search", "Figure 17. Boarding-house search: only houses with free beds are shown."),
        *shot("06-boarding-detail", "Figure 18. Boarding-house detail with rooms and the enquiry form."),
        PageBreak(),
    ]

    # 10 Booking
    story += [
        p("10. Booking system", "h1"),
        booking_diagram(),
        p("Figure 19. Booking statuses and transitions.", "caption"),
        *bullets(
            [
                "Booking mode is set per listing and per boarding house (request or instant).",
                "<b>Short stays</b> are priced per night between check-in and check-out. <b>Rentals</b> and <b>boarding beds</b> are booked from a move-in date for a number of months paid upfront. <b>Sales</b> are enquiry-only.",
                "Totals are always computed on the server; a client-sent total is ignored (tested).",
                "Unpaid holds expire after 30 minutes (instant) or 24 hours after acceptance (request). Expiry runs whenever bookings are read and via <i>manage.py expire_bookings</i> for a scheduler.",
                "A payment that arrives after its hold expired confirms the booking only if the dates or bed are still free; otherwise it is refunded automatically.",
                "Cancellation: before payment, nothing to refund. A guest cancelling a paid booking at least 48 hours before check-in gets a full refund; later, no automatic refund (an admin can still refund). A provider cancellation always refunds in full. A checked-in occupant must be checked out, not cancelled.",
                "Providers and guests are notified at each step (request, acceptance, rejection, payment, cancellation, expiry).",
            ]
        ),
        *shot("08-booking-detail", "Figure 20. A confirmed booking from the guest's side, with progress steps and receipt link."),
        PageBreak(),
    ]

    # 11 Payments
    story += [
        p("11. Online payment integration", "h1"),
        p("Gateway research (verified before choosing, as the brief asked):", "h2"),
        table(
            [
                ["Provider", "Zambia support (sources checked 16 Nov 2026)", "Decision"],
                ["Flutterwave", "Official docs list a <i>mobile_money_zambia</i> charge (ZMW) available to Zambian merchants, and ZMW cards. Flutterwave holds a Zambian payment licence covering cards and mobile money. Exactly which networks (MTN, Airtel, Zamtel) work for collections should be confirmed in your Flutterwave dashboard.", "Chosen"],
                ["Paystack", "No evidence of Zambian merchant support; supported markets are Nigeria, Ghana, Kenya, South Africa and Cote d'Ivoire.", "Not usable"],
                ["Lenco (Lusaka)", "API supports mobile-money collections in Zambia; keys are requested from Lenco support; card collection needs PCI DSS certification.", "Alternative"],
            ],
            [26 * mm, CONTENT_W - 50 * mm, 24 * mm],
        ),
        Spacer(1, 6),
        payment_diagram(),
        p("Figure 21. Payment flow; the browser is never trusted with the result.", "caption"),
        *bullets(
            [
                "<b>No card data touches Nyumba:</b> Flutterwave Standard hosted checkout (<i>payment_options = card, mobilemoneyzambia</i>).",
                "<b>Server-side verification:</b> Nyumba calls Flutterwave's verify endpoint and compares status, tx_ref, currency (ZMW) and amount with what it charged. Any mismatch fails the payment (tested with a tampered amount).",
                "<b>Webhooks:</b> <i>/api/payments/webhooks/flutterwave/</i> checks the <i>verif-hash</i> header with a constant-time comparison, then re-verifies through the API, so a forged body can't confirm anything.",
                "<b>No double processing:</b> the payment row is locked; a settled payment is returned as-is; a gateway transaction id is unique.",
                "<b>Auditable history:</b> Payment, Refund, Commission and ProviderPayout rows; receipts at <i>/payments/{id}/receipt</i> (printable).",
                "<b>Sandbox:</b> with <i>PAYMENT_GATEWAY=sandbox</i> (the default) a local test checkout simulates success or decline and goes through the same verification code. It is refused when any other gateway is configured.",
            ]
        ),
        p(
            "<b>To go live:</b> create a Flutterwave account, put <i>FLUTTERWAVE_SECRET_KEY</i> and <i>FLUTTERWAVE_WEBHOOK_HASH</i> in <i>backend/.env</i>, set <i>PAYMENT_GATEWAY=flutterwave</i>, and register "
            "<i>https://your-domain/api/payments/webhooks/flutterwave/</i> as the webhook URL. The Flutterwave adapter has not yet been run against Flutterwave's servers (no keys were available)."
        ),
        PageBreak(),
        *shot("09-payments", "Figure 22. A guest's payment history with receipts."),
    ]

    # 12 Commission
    story += [
        p("12. Commission calculations", "h1"),
        p(
            "All money is calculated once, in <i>services.price_breakdown()</i>, when a booking is created, and stored on its Commission row so later rate changes don't rewrite history. "
            "Rates live in the <i>CommissionRate</i> table, one row per category (short stay, rental, boarding), each starting at 10% (your choice: separate rates per type). Administrators edit them on the "
            "<i>Commission & categories</i> page; values are limited to 0-50% commission and 0-20% payment fee."
        ),
        table(
            [
                ["Quantity", "Formula", "Worked example (tested)"],
                ["Gross booking value", "unit price x nights or months", "K500 x 3 nights = K1,500.00"],
                ["Platform commission", "gross x category rate", "K1,500 x 12% = K180.00"],
                ["Payment processing fee", "gross x category fee rate", "K1,500 x 2% = K30.00"],
                ["Provider earnings / net payout", "gross - commission - fee", "K1,290.00"],
            ],
            [42 * mm, 58 * mm, CONTENT_W - 100 * mm],
        ),
        Spacer(1, 6),
        p(
            "Commission states: <i>pending</i> (unpaid), <i>earned</i> (payment verified), <i>paid_out</i> (included in a payout the admin recorded with a transfer reference), <i>refunded</i> (full refund or rejected booking). "
            "Sales have no booking commission because they are enquiry-only; this is documented as a business decision for you to confirm."
        ),
        *shot("22-admin-commission", "Figure 23. Commission rates per booking type, editable by administrators."),
        PageBreak(),
    ]

    # 13 Favourites, 14 Admin
    story += [
        p("13. Favourites", "h1"),
        p(
            "Favourites are rows in the database tied to the signed-in user, for listings and boarding houses (constraints: exactly one target, no duplicates). They persist across devices. The header count and every heart "
            "button share one store and update optimistically, rolling back if the server refuses. Users can only see and remove their own favourites (tested)."
        ),
        *shot("11-favourites", "Figure 24. Favourites, split into homes and boarding houses."),
        p("14. Administrator dashboard", "h1"),
        *bullets(
            [
                "<b>Overview:</b> users, approved and pending providers, live and pending listings, active bookings, gross booking value, platform commission (month and total), a commission chart and recent platform activity, plus a <i>needs your attention</i> list.",
                "<b>Users:</b> search, filter by provider/admin, suspend and reactivate accounts, suspend and reinstate provider access with a reason.",
                "<b>Provider applications:</b> approve, or reject with a reason and the reapply switch.",
                "<b>Listings:</b> review queue, approve (optionally marking ownership verified), ask for changes, remove with a reason; approve or hide boarding houses.",
                "<b>Reports:</b> listings flagged by users, resolve or dismiss.",
                "<b>Finance:</b> financial report by date range (by category and by provider), all transactions, refunds (partial or full) and provider payouts.",
                "<b>Categories:</b> the fixed vocabularies used by web and mobile filters.",
            ]
        ),
        PageBreak(),
        *shot("18-admin-overview", "Figure 25. Administrator overview."),
        *shot("21-admin-finance", "Figure 26. Finance report."),
        PageBreak(),
        *shot("20-admin-listings", "Figure 27. Listing moderation."),
    ]

    # 15 Django changes / 16 DB
    story += [
        p("15. Django backend changes", "h1"),
        *bullets(
            [
                "<b>Settings:</b> secrets from <i>backend/.env</i> (python-dotenv); <i>DATABASE_URL</i> (dj-database-url) with SQLite fallback; media storage; default IsAuthenticated permission; uniform error format; auth rate limit; payment and booking-window settings.",
                "<b>Modules:</b> <i>models.py</i> (data), <i>services.py</i> (every business rule), <i>gateways.py</i> (Sandbox and Flutterwave behind one interface), <i>serializers.py</i>, <i>permissions.py</i>, and <i>api/</i> split into accounts, marketplace, provider and admin. URLs in <i>apps/properties/urls.py</i>.",
                "<b>Commands:</b> <i>seed_demo</i> (Lusaka demo data and test accounts, written to a git-ignored file) and <i>expire_bookings</i> (for a scheduler).",
                "<b>Django admin</b> moved to <i>/django-admin/</i> as a back-office fallback; payments are read-only there.",
                "<b>Requirements:</b> added pillow, python-dotenv, dj-database-url, requests; file rewritten as UTF-8 (it was UTF-16).",
            ]
        ),
        p("16. Database model changes", "h1"),
        er_diagram(),
        p("Figure 28. Main entities and relationships.", "caption"),
        *bullets(
            [
                "<b>New:</b> ProviderApplication, ProviderProfile, PropertyImage, PropertyUnit, BoardingRoom, Payment, Refund, CommissionRate, ProviderPayout, Favourite, Notification, Review, ListingReport.",
                "<b>Changed:</b> UserProfile (role/user_type/verification removed, active_mode added); Property (type, bathrooms, size, furnishing, amenities, town, managers, timestamps); Listing (removed status, publish switch, booking mode, availability, note); BoardingHouse (rooms replace capacity/price; policy, amenities, rules, approval); BoardingTenancy (belongs to a room, walk-in occupant fields, reserved status); Booking (user, room or listing, mode, reference, periods, statuses, payment window, cancellation fields); Commission (gross, fee, net, payout).",
                "<b>Constraints and indexes:</b> one pending application per user; one open bed per account; booking targets exactly one of listing/room; check-out after check-in; room capacity at least 1; unique room names per house; one favourite per target; rating 1-5; indexes on search, booking and notification lookups.",
                "<b>Migrations:</b> 0008 adds the new structure and carries existing data across (providers to applications, boarding capacity to a first room, booking statuses, commission split, default rates) before old columns are dropped; 0009 tightens columns. Applied to your local database after a backup (<i>backend/db.backup-before-upgrade.sqlite3</i>).",
            ]
        ),
        PageBreak(),
    ]

    # 17 Endpoints
    endpoints = [
        ["Area", "Endpoints (all under /api/)"],
        ["Auth", "auth/register, auth/login, auth/logout, auth/password-reset, auth/password-reset/confirm, auth/change-password, me (GET/PATCH), me/mode, provider-applications (GET/POST)"],
        ["Marketplace", "listings/search, listings/{id}, boarding-houses, boarding-houses/{id}, favourites (GET/POST), favourites/remove, enquiries, reports, notifications, notifications/read"],
        ["Bookings", "bookings (GET/POST), bookings/{id}, bookings/{id}/cancel, bookings/{id}/pay, bookings/{id}/review, placement"],
        ["Payments", "payments, payments/verify, payments/{id}/receipt, payments/sandbox/complete (sandbox only), payments/webhooks/flutterwave (public, signed)"],
        ["Provider", "provider/dashboard, provider/properties (+ /{id}, /{id}/listings, /{id}/images, /{id}/units), provider/listings/{id}, provider/images/{id}, provider/units/{id}, provider/boarding-houses (+ /{id}, /{id}/rooms, /{id}/occupants, /{id}/report), provider/rooms/{id}, provider/occupants (+ /{id}, /{id}/check-in, /{id}/check-out), provider/bookings, provider/bookings/{id}/accept|reject|cancel, provider/enquiries (+ /{id}/read), provider/payouts"],
        ["Admin", "admin/overview, admin/users (+ /{id}/suspend|reactivate|suspend-provider|reinstate-provider), admin/applications (+ /{id}/approve|reject), admin/listings (+ /{id}/approve|reject|remove), admin/boarding-houses (+ /{id}/approve|reject|remove), admin/owners/{id}/verify, admin/reports (+ /{id}), admin/categories, admin/payments, admin/bookings, admin/refunds, admin/commission-rates, admin/financial-report, admin/payouts"],
        ["Removed", "api/register, api/login, api/profile, api/listings (router), api/listings/create, api/listings/{id}/inquire|book, api/dashboard, api/bookings/{id}/status and the old provider/student tenancy routes: replaced by the endpoints above."],
    ]
    story += [
        p("17. API endpoints added or modified", "h1"),
        p("Errors always come back as <i>{\"error\": \"...\", \"fields\": {...}}</i>. Lists that can grow use <i>?page=&amp;page_size=</i>. The same endpoints serve the web app and the future Flutter apps."),
        table(endpoints, [24 * mm, CONTENT_W - 24 * mm]),
        PageBreak(),
    ]

    # 18 business logic, 19 security
    story += [
        p("18. Business logic improvements", "h1"),
        table(
            [
                ["Rule from the brief", "Where it's enforced"],
                ["Only approved providers can publish listings", "IsApprovedProvider on every provider endpoint; Listing.public() requires an approved provider profile"],
                ["Providers manage only authorised properties", "managed_properties() (owner or manager) on every provider query; others get 404"],
                ["Providers can browse the marketplace", "Marketplace endpoints need only a signed-in user"],
                ["Switch experience without a new account", "UserProfile.active_mode, services.switch_mode()"],
                ["Students see only accommodation with space", "search_boarding_houses drops rooms and houses with no free bed"],
                ["Occupancy updates automatically", "Counted from tenancy and booking rows on every read (services.room_occupancy)"],
                ["Rooms never exceed capacity", "Row lock + re-count in register_occupant, accept_booking, create_room_booking, payment confirmation; capacity edits validated"],
                ["Unpublished properties hidden", "Listing.public() / BoardingHouse.public()"],
                ["Favourites belong to the user", "Queries filtered by request.user; unique constraints"],
                ["Bookings belong to the right user and property", "Guest endpoints filter by user; provider endpoints by managed property"],
                ["Providers receive enquiries and booking notifications", "services.notify() on enquiry, request, payment, cancellation"],
                ["Payments verified by the backend", "services.verify_payment() + gateway verify; webhook signature"],
                ["No duplicate bookings or conflicting reservations", "Row locks + overlap query of confirmed and unexpired held bookings"],
                ["Commission calculated by the backend", "services.price_breakdown() at booking creation"],
                ["Suspended providers can't publish or manage", "Permission check + public() querysets exclude them"],
            ],
            [70 * mm, CONTENT_W - 70 * mm],
        ),
        p("Decisions made where the brief was open (please confirm)", "h2"),
        *bullets(
            [
                "Pending booking requests don't hold dates or beds; conflicts are checked again when the provider accepts. This stops one unanswered request from blocking everyone.",
                "Rentals are paid online as N months upfront from the move-in date; deposits and later months are handled off-platform. Sales are enquiry-only and carry no booking commission.",
                "The processing fee is deducted from the provider's share and defaults to 0% until you set it.",
                "Guest refund window: 48 hours before check-in (setting NYUMBA_FREE_CANCEL_HOURS).",
                "New listings and boarding houses still need administrator approval even from approved providers (this preserves the existing moderation step).",
                "Existing providers were migrated as pending applications, not auto-approved.",
                "Payouts are recorded manually by an administrator after an off-platform transfer; there is no automated disbursement.",
            ]
        ),
        PageBreak(),
        p("19. Security and permissions", "h1"),
        *bullets(
            [
                "Default deny: every endpoint requires authentication unless explicitly opened (auth endpoints, signed webhook).",
                "Three permission levels: signed-in user, approved provider (IsApprovedProvider), administrator (IsPlatformAdmin = is_staff).",
                "Object-level scoping returns 404 for other people's bookings, payments, receipts, properties, rooms and occupants, so record ids can't be probed.",
                "Session token is in an httpOnly cookie on the web; logout and password changes revoke it server-side.",
                "Prices, totals, commission, availability and payment results are always computed or verified on the server; client-sent amounts are ignored.",
                "Uploads are type-checked, size-limited (5 MB) and parsed with Pillow before saving; at most 20 photos per property.",
                "Rate limits on authentication; CORS limited to configured origins; DEBUG off unless set; SECRET_KEY from environment.",
                "The sandbox gateway can't be used when a real gateway is configured.",
            ]
        ),
        p("Known security follow-ups", "h2"),
        *bullets(
            [
                "Rate-limit counters use Django's in-process cache; production with several workers needs a shared cache (for example Redis).",
                "Production should run behind HTTPS with SECURE_* settings (HSTS, secure cookies, SECURE_PROXY_SSL_HEADER) and a real SMTP backend for reset emails.",
                "The demo account file and the backup database are local only and git-ignored; delete them before deploying anything.",
            ]
        ),
        PageBreak(),
    ]

    # 20 Testing
    test_rows = [["Test", "Result"]]
    for t in tests:
        name, _, result = t.rpartition(" ... ")
        short = name.split(" (")[0].replace("test_", "").replace("_", " ")
        cls = name.split(".")[-2] if "." in name else ""
        test_rows.append([f"{cls}: {short}", result])
    story += [
        p("20. Testing results", "h1"),
        p(f"<b>Automated backend tests:</b> {passed} of {len(tests)} passed (<i>python manage.py test apps.properties.tests</i>, SQLite, sandbox gateway).", "body"),
        table(test_rows, [CONTENT_W - 22 * mm, 22 * mm]),
        Spacer(1, 8),
        p("Other checks", "h2"),
        table(
            [
                ["Check", "Result"],
                ["TypeScript (tsc --noEmit)", "No errors"],
                ["ESLint (Next.js + React hooks rules)", "0 errors; 4 warnings for deliberate full-page navigations after sign-in and sign-out"],
                ["next build (production)", "Passes; 42 routes; proxy (route protection) active"],
                ["Browser end to end (in-app browser, as a seeded user)", "Login -> Explore (map, markers, cards) -> listing -> instant booking -> 30-minute hold -> test checkout -> server verification -> confirmed booking; K270 commission (10% of K2,700) then visible on the admin overview"],
                ["Browser: provider and admin", "Provider dashboard, boarding houses, rooms; admin overview, applications, finance, commission settings; responsive check at 390 px"],
                ["Django system checks", "No issues"],
            ],
            [62 * mm, CONTENT_W - 62 * mm],
        ),
        p("Not tested", "h2"),
        *bullets(
            [
                "PostgreSQL: the code is written for it (row locks use SELECT ... FOR UPDATE OF), but no test ran on PostgreSQL because the database password wasn't available.",
                "Live Flutterwave calls (checkout, verify, refund, webhook delivery) and real mobile money; only the sandbox path ran.",
                "Email delivery of reset links (console backend in development; the link content is covered by a test).",
                "No automated frontend tests; frontend correctness rests on type checking, the build and the browser walk-throughs above. Not every page was viewed at phone width.",
            ]
        ),
        PageBreak(),
    ]

    # 21 Outstanding
    story += [
        p("21. Outstanding issues", "h1"),
        status_table(
            [
                ("Run on PostgreSQL", "partial", "Add DATABASE_URL to backend/.env, run migrate, rerun the tests."),
                ("PostGIS geo search", "todo", "Not adopted (your decision). Bounding-box search on indexed lat/lng is used instead."),
                ("Live Flutterwave", "partial", "Needs test keys, webhook hash and a public HTTPS URL; confirm mobile networks with Flutterwave."),
                ("Automated payouts", "todo", "Payouts are recorded manually; Flutterwave transfers API could automate them."),
                ("Email / SMS notifications", "partial", "In-app notifications only; reset emails use the console backend until SMTP is set."),
                ("Property managers UI", "partial", "Model and permissions support co-managers; assigning them is only possible in Django admin."),
                ("Scheduled expiry", "partial", "Holds expire on every read; schedule manage.py expire_bookings for idle periods."),
                ("Reviews", "partial", "Guests can rate completed bookings; no moderation or provider replies."),
                ("Frontend automated tests", "todo", "Suggest Playwright flows for login, booking and payment."),
                ("Flutter apps", "todo", "Future phase; the REST API is ready."),
                ("Real photos for old listings", "todo", "Seeded demo listings use generated illustrations; the 16 older listings have none."),
            ]
        ),
        PageBreak(),
    ]

    # 22 Files
    rows = [["", "File"]]
    for parts in changed:
        if len(parts) < 2:
            continue
        flag, path = parts[0].strip(), parts[-1].strip()
        rows.append([{"M": "Modified", "D": "Deleted", "A": "Added", "??": "New"}.get(flag, flag), path])
    story += [
        p("22. Modified and newly created files", "h1"),
        p(f"{len(rows) - 1} files compared with <i>main</i> (generated build output, caches, screenshots and uploaded media excluded)."),
        table(rows, [20 * mm, CONTENT_W - 20 * mm]),
    ]

    doc = SimpleDocTemplate(
        str(OUT),
        pagesize=A4,
        leftMargin=18 * mm,
        rightMargin=18 * mm,
        topMargin=16 * mm,
        bottomMargin=18 * mm,
        title="Nyumba system upgrade report",
        author="Nyumba",
    )
    doc.build(story, onFirstPage=on_page, onLaterPages=on_page)
    print(f"Wrote {OUT}")


if __name__ == "__main__":
    build()
