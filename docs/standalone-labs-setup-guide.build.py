# Builds standalone-labs-setup-guide.pdf (same folder). Needs reportlab:
#   python3 -m venv /tmp/gv && /tmp/gv/bin/pip install reportlab && /tmp/gv/bin/python standalone-labs-setup-guide.build.py
import os
from reportlab.lib.pagesizes import letter
from reportlab.lib.units import inch
from reportlab.lib import colors
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.enums import TA_LEFT
from reportlab.platypus import (BaseDocTemplate, PageTemplate, Frame, Paragraph, Spacer,
                                Table, TableStyle, Preformatted)

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "standalone-labs-setup-guide.pdf")
REPO = "https://github.com/curtismu7/AI-DEMO-Standalone"
RAW = "https://raw.githubusercontent.com/curtismu7/AI-DEMO-Standalone/main/scripts/install.sh"
RAW_POLICY = "https://raw.githubusercontent.com/curtismu7/AI-DEMO-Standalone/main/policy/ai-demo-p1az.standalone.snapshot.json"

INK = colors.HexColor("#1b2330")
MUTED = colors.HexColor("#5b6677")
ACCENT = colors.HexColor("#b3282d")
RULE = colors.HexColor("#d9dde3")
SHADE = colors.HexColor("#f3f5f8")
LINK = "#1a4fd0"

base = ParagraphStyle("base", fontName="Helvetica", fontSize=9.6, leading=13.6, textColor=INK, alignment=TA_LEFT)
h1 = ParagraphStyle("h1", parent=base, fontName="Helvetica-Bold", fontSize=22, leading=26, spaceAfter=4)
sub = ParagraphStyle("sub", parent=base, fontSize=10.5, leading=15, textColor=MUTED, spaceAfter=10)
h2 = ParagraphStyle("h2", parent=base, fontName="Helvetica-Bold", fontSize=13, leading=17, spaceBefore=14,
                    spaceAfter=5, textColor=INK, keepWithNext=1)
cell = ParagraphStyle("cell", parent=base, fontSize=8.8, leading=12)
cellb = ParagraphStyle("cellb", parent=cell, fontName="Helvetica-Bold")
head = ParagraphStyle("head", parent=cell, fontName="Helvetica-Bold", textColor=colors.white)
note = ParagraphStyle("note", parent=base, fontSize=9, leading=12.5, textColor=MUTED)
code = ParagraphStyle("code", fontName="Courier", fontSize=7.9, leading=10.6, textColor=INK)


def link(url, text=None):
    return f'<link href="{url}" color="{LINK}"><u>{text or url}</u></link>'


def codeblock(text):
    t = Table([[Preformatted(text, code)]], colWidths=[6.9 * inch])
    t.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), SHADE),
        ("BOX", (0, 0), (-1, -1), 0.6, RULE),
        ("LEFTPADDING", (0, 0), (-1, -1), 8), ("RIGHTPADDING", (0, 0), (-1, -1), 8),
        ("TOPPADDING", (0, 0), (-1, -1), 6), ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
    ]))
    return t


def table(rows, widths, header=True, num=None):
    """num=N prepends a '#' column numbered N.1, N.2, ... so rows can be referred to by number."""
    rows = [list(r) for r in rows]
    widths = list(widths)
    if num is not None:
        rows = [["#"] + rows[0]] + [[f"{num}.{i}"] + r for i, r in enumerate(rows[1:], 1)]
        widths = [0.45] + widths
        widths[-1] -= 0.45
    data = []
    for i, r in enumerate(rows):
        out = []
        for j, c in enumerate(r):
            if header and i == 0:
                st = head
            elif num is not None and j == 0:
                st = cellb
            else:
                st = cell
            out.append(Paragraph(c, st))
        data.append(out)
    t = Table(data, colWidths=[w * inch for w in widths], repeatRows=1 if header else 0)
    style = [
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LINEBELOW", (0, 0), (-1, -1), 0.4, RULE),
        ("LEFTPADDING", (0, 0), (-1, -1), 6), ("RIGHTPADDING", (0, 0), (-1, -1), 6),
        ("TOPPADDING", (0, 0), (-1, -1), 5), ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
    ]
    if header:
        style += [("BACKGROUND", (0, 0), (-1, 0), INK)]
    t.setStyle(TableStyle(style))
    return t


def on_page(c, doc):
    c.saveState()
    c.setStrokeColor(ACCENT); c.setLineWidth(3)
    c.line(0.8 * inch, letter[1] - 0.55 * inch, 1.5 * inch, letter[1] - 0.55 * inch)
    c.setFont("Helvetica", 7.5); c.setFillColor(MUTED)
    c.drawString(0.8 * inch, 0.5 * inch, "Standalone labs - setup guide")
    c.drawRightString(letter[0] - 0.8 * inch, 0.5 * inch, f"Page {doc.page}")
    c.restoreState()


doc = BaseDocTemplate(OUT, pagesize=letter, leftMargin=0.8 * inch, rightMargin=0.8 * inch,
                      topMargin=0.85 * inch, bottomMargin=0.8 * inch,
                      title="Standalone labs - setup guide", author="")
doc.addPageTemplates([PageTemplate(id="p", frames=[Frame(
    0.8 * inch, 0.8 * inch, letter[0] - 1.6 * inch, letter[1] - 1.65 * inch, id="f",
    leftPadding=0, rightPadding=0, topPadding=0, bottomPadding=0)], onPage=on_page)])
S = []

S += [Paragraph("Standalone labs: setup guide", h1),
      Paragraph("Run the Ping demo labs on your own Mac, against your own PingOne environment. "
                "It needs a one-time console step for your admin Worker app first.", sub)]

# 1. Laptop admin rights
S.append(Paragraph("1. Get admin rights on your laptop", h2))
S.append(Paragraph("Setup installs and configures software on your Mac, so you need to be an <b>administrator</b> on the laptop first. "
                   "Your account shows as Standard until you request more. Request admin rights through <b>Self Service+</b>:", base))
S.append(Spacer(1, 4))
S.append(table([
    ["Do this"],
    ["Click the <b>Self Service+</b> icon in the macOS menu bar (top right)."],
    ["Under <b>User Privileges</b>, choose <b>Request Admin Privileges</b>. The menu shows <i>Standard - your name</i> until it is granted."],
    ["Once the menu shows admin rights, run the setup in Terminal (section 4)."],
], [6.9], num=1))

# 2. What you need
S.append(Paragraph("2. What you need", h2))
S.append(table([
    ["Item", "Where"],
    ["Setup instructions", f'{link(REPO + "/blob/main/SETUP.md", "SETUP.md")} and {link(REPO + "/blob/main/README.md", "README.md")}'],
    ["One-line installer", link(RAW, "scripts/install.sh")],
    ["Authorize policy to import (optional; live Authorize only)",
     f'{link(REPO + "/blob/main/policy/ai-demo-p1az.standalone.snapshot.json", "policy/ai-demo-p1az.standalone.snapshot.json")}<br/>'
     f'Direct download: {link(RAW_POLICY, "raw file")} (or <font name="Courier">curl -LO</font> that link)<br/>'
     f'Notes: {link(REPO + "/blob/main/policy/README.md", "policy/README.md")}'],
    ["What each lab needs for live mode", link(REPO + "/blob/main/docs/REAL-PREREQUISITES.md", "docs/REAL-PREREQUISITES.md")],
    ["Repository", link(REPO)],
], [2.3, 4.6], num=2))
S.append(Spacer(1, 5))
S.append(Paragraph("A Mac with git, Node and Docker (OrbStack recommended), and a PingOne organization where you can "
                   "create a Worker app and environments.", note))

# 3. Console step
S.append(Paragraph("3. One-time step in the PingOne console", h2))
S.append(Paragraph("Create an admin Worker app in your <b>Administrators</b> environment. The setup script uses it to create "
                   "your demo environment.", base))
S.append(Spacer(1, 4))
S.append(table([
    ["Do this"],
    ["Applications &gt; <b>+</b> &gt; <b>Worker</b>. Authentication: <b>Client Secret Basic</b>. Enabled."],
    ["Open the app &gt; <b>Roles</b> &gt; <b>Grant Roles</b> &gt; <b>Organization Admin</b>, scope: the <b>Organization</b>."],
    ["Grant Roles again &gt; <b>Environment Admin</b>, scope: the <b>Administrators environment</b> "
     "(not the organization). Without this, the script cannot read the Worker's own roles and stops at its role check."],
    ["Note three values: the Administrators <b>environment ID</b>, the Worker <b>client ID</b> and the Worker <b>client secret</b>."],
], [6.9], num=3))

# 4. Run setup
S.append(Paragraph("4. Run setup", h2))
S.append(Paragraph("Region: use <b>na</b> for North America (the .com domain). Other values: eu, ca, asia. "
                   "Paste commands as <b>plain text</b>: curly quotes copied from chat or email break them.", base))
S.append(Spacer(1, 5))
S.append(codeblock(
    "curl -fsSL " + RAW + " \\\n"
    "  | PINGONE_REGION=na \\\n"
    "    PINGONE_ADMIN_ENV_ID=<admin-env-id> \\\n"
    "    PINGONE_WORKER_CLIENT_ID=<client-id> \\\n"
    "    PINGONE_WORKER_CLIENT_SECRET=<client-secret> \\\n"
    "    bash"))
S.append(Spacer(1, 5))
S.append(Paragraph("Already cloned? Re-run PingOne setup alone:", base))
S.append(Spacer(1, 3))
S.append(codeblock(
    "cd ~/Development/AI-DEMO-Standalone && ./scripts/setup.sh setup --region na \\\n"
    "  --admin-env-id <admin-env-id> --client-id <client-id> --client-secret <client-secret>"))
S.append(Spacer(1, 5))
S.append(Paragraph("Then run <font name='Courier'>./scripts/setup.sh</font> for the full first-time setup (add "
                   "<font name='Courier'>--no-start</font> to start no labs), and open the shelf at "
                   f'{link("https://local.ping-devops.com:8443")}.', base))

# 5. What it creates
S.append(Paragraph("5. What setup creates, and what it does not", h2))
S.append(table([
    ["Created for you", "Not created (your step, or not available)"],
    ["A SANDBOX environment named <b>Standalone Labs Demo</b> with SSO, MFA, DaVinci and Authorize enabled<br/><br/>"
     "A lab Worker app and a user app (for pi.flow sign-in)<br/><br/>"
     "Your lab settings in <font name='Courier'>~/Development/.env</font> and your admin credentials in "
     "<font name='Courier'>~/.config/demo-kit/provisioning.json</font> (both on your machine only)",
     "<b>Authorize policy</b>: import the snapshot by hand (Console &gt; your environment &gt; Authorize &gt; Trust Framework &gt; Import). "
     "It uses placeholder .example hosts, so after the import set the <font name='Courier'>HasValidMcpAudience</font> condition to your own gateway URI. "
     "Mock mode works without it.<br/><br/>"
     "<b>PingOne Privilege</b>: a SANDBOX license cannot include it.<br/><br/>"
     "<b>Customer Agent LAB, full Real mode</b>: needs two more apps (setup offers to create them); its agent gateway only "
     "accepts tokens from the owner's environment.<br/><br/>"
     "Per-lab users, flows and policies: see REAL-PREREQUISITES."],
], [3.45, 3.45]))
S.append(Spacer(1, 5))
S.append(Paragraph("Everything starts in mock mode without any PingOne setup. Labs that need real sign-in or real policy decisions "
                   "may need extra console work.", note))

# 6. If it stops
S.append(Paragraph("6. If it stops", h2))
S.append(table([
    ["What you see", "Fix"],
    ["Stops silently after \"Minting an organization token...\"",
     "Wrong region host or a network failure. Use <font name='Courier'>--region na</font> (or com), run plain text, and make sure "
     "you have the latest script (setup.sh updates itself from main)."],
    ["\"holds no organization-scoped admin role\"",
     "Add both roles from section 3 (Organization Admin on the Organization, Environment Admin on the Administrators environment) "
     "and check you entered the client ID of that Worker."],
    ["<font name='Courier'>Permission denied ... provisioning.json</font>",
     "Your account cannot write <font name='Courier'>~/.config/demo-kit</font> (usually root-owned from an earlier sudo run). "
     "The environment is already created. Use one of the fixes in section 7, then re-run and answer <b>r</b> to reuse it."],
    ["\"WARN setup failed - continuing in mock mode\"",
     "The PingOne step failed, usually the line just above it (for example the permission error). Labs still start in mock mode, "
     "but the new environment exists and your admin credentials were not saved. Fix the cause, then re-run PingOne setup alone (section 4)."],
    ["\"Environment already exists with the name 'Standalone Labs Demo'\"",
     "An environment with that name is already in your organization. Update the repo (<font name='Courier'>./scripts/setup.sh</font> does it); "
     "current setup finds it and asks what to do. See section 8."],
    ["\"Errors during submodule fetch\"",
     "<font name='Courier'>git submodule sync &amp;&amp; git submodule update --init</font> in the repo folder."],
    ["\"Environment cannot be created in specified region\"",
     "Update the repo (<font name='Courier'>./scripts/setup.sh</font> does it); fixed on main."],
], [2.5, 4.4], num=6))

# 7. Permission error fixes
S.append(Paragraph("7. Fixing the provisioning.json permission error", h2))
S.append(Paragraph("First check who owns the folders:", base))
S.append(Spacer(1, 3))
S.append(codeblock("ls -ld ~/.config ~/.config/demo-kit ~/.config/demo-kit/provisioning.json"))
S.append(Spacer(1, 5))
S.append(Paragraph("If the owner is <b>root</b> instead of you, pick one. Fix <b>7.1</b> needs no admin rights at all:", base))
S.append(Spacer(1, 4))
S.append(table([
    ["Option", "Command", "Notes"],
    ["Write the file somewhere you own (no sudo)",
     "<font name='Courier'>export STANDALONE_CRED_FILE=\"$HOME/.demo-kit-provisioning.json\"</font><br/>then run setup as in section 4",
     "Set it in every Terminal where you run setup or teardown, or add the export line to <font name='Courier'>~/.zshrc</font>."],
    ["Only the demo-kit folder is root-owned (no sudo)",
     "<font name='Courier'>mv ~/.config/demo-kit ~/.config/demo-kit.old</font>",
     "Needs you to own <font name='Courier'>~/.config</font>. Setup then creates a fresh folder. The old one stays behind."],
    ["<font name='Courier'>~/.config</font> itself is root-owned (no sudo)",
     "<font name='Courier'>mv ~/.config ~/.config.old &amp;&amp; cp -R ~/.config.old ~/.config</font>",
     "Heavier: copies your other apps' settings into a folder you own. The old folder stays behind."],
    ["You have admin rights (section 1)",
     "<font name='Courier'>sudo chown -R \"$(whoami)\" ~/.config</font>",
     "Fixes ownership in place."],
    ["You own the file but it is read-only",
     "<font name='Courier'>chmod -R u+w ~/.config/demo-kit</font>", ""],
], [1.9, 2.9, 2.1], num=7))
S.append(Spacer(1, 4))
S.append(Paragraph("Then re-run the setup command. It finds the existing \"Standalone Labs Demo\" environment and asks whether to reuse it "
                   "(section 8): answer <b>r</b>. Reuse re-creates the lab worker's secret, so the new secret goes into your "
                   "<font name='Courier'>.env</font>.", base))

# 8. Environment already exists
S.append(Paragraph("8. If the environment already exists", h2))
S.append(Paragraph("Setup always names the environment <b>Standalone Labs Demo</b>, and PingOne does not allow two environments with the same "
                   "name in an organization. When setup finds one, it checks whether it is <b>yours</b> by comparing its ID with "
                   "<font name='Courier'>PINGONE_ENVIRONMENT_ID</font> in your <font name='Courier'>~/Development/.env</font> "
                   "(written by your earlier run), then asks <font name='Courier'>Reuse it (r), or stop (n)?</font>", base))
S.append(Spacer(1, 4))
S.append(table([
    ["Case", "What setup does, and what to do"],
    ["<b>It is yours</b>: the ID matches your <font name='Courier'>.env</font> (an earlier run stopped part way)",
     "Prints \"it matches PINGONE_ENVIRONMENT_ID ... it is yours\" and the prompt defaults to <b>r</b>. Press Enter or type <b>r</b>."],
    ["<b>It is not yours</b>, or your <font name='Courier'>.env</font> has no ID (may belong to a colleague in the same organization)",
     "Warns that reuse re-creates that environment's lab worker secret, which breaks the owner's labs, and the prompt defaults to <b>n</b>: "
     "setup stops. Do not type r unless you are sure you created it (for example, on a new Mac). Otherwise ask who owns it, "
     "or delete it in the console if it is an orphan of yours."],
    ["<b>No terminal</b> (for example the piped installer)",
     "Reuses only if it is yours; otherwise stops with the same message."],
], [2.6, 4.3], num=8))
S.append(Spacer(1, 5))
S.append(Paragraph("To reuse your own environment, run this (plain text; fill in your own values). The first line also avoids the "
                   "provisioning.json permission error without sudo (fix 7.1):", base))
S.append(Spacer(1, 3))
S.append(codeblock(
    "export STANDALONE_CRED_FILE=\"$HOME/.demo-kit-provisioning.json\"\n"
    "cd ~/Development/AI-DEMO-Standalone && ./scripts/setup.sh setup --region na \\\n"
    "  --admin-env-id <admin-env-id> --client-id <client-id> --client-secret <client-secret>"))
S.append(Spacer(1, 4))
S.append(Paragraph("Reuse re-creates the lab worker's secret: the old one stops working and the new one is written to your "
                   "<font name='Courier'>.env</font>. A good run ends with \"admin credentials saved\" and \"Done\". "
                   "If you used the export line, set it again in any Terminal where you run teardown, or add it to <font name='Courier'>~/.zshrc</font>.", base))

# 9. Cleaning up
S.append(Paragraph("9. Cleaning up, and keeping your credentials safe", h2))
S.append(Paragraph("Delete the demo environment when you are done: <font name='Courier'>./scripts/setup.sh teardown</font> "
                   "(<font name='Courier'>--dry-run</font> shows what would be deleted). It reads the saved admin credentials, so it does "
                   "not prompt for them.", base))
S.append(Spacer(1, 4))
S.append(Paragraph("Treat the admin Worker's client secret like a password: do not paste it into chat, tickets or screenshots. "
                   "If it has been shared, rotate it in the console. Note that the Worker the script creates inside your new environment "
                   "inherits roles from your admin Worker, so keep that environment to demo use.", base))

doc.build(S)
print("ok", OUT)
