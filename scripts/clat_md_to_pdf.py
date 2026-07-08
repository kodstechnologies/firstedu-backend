#!/usr/bin/env python3
"""
Convert CLAT mock markdown (Claude / Gemini export formats) to a clean exam PDF.

Output uses only Mock title + section headings + questions / answers / explanations.
No source filenames or generator metadata.

USAGE
-----
    python clat_md_to_pdf.py gemini.md -o mock1.pdf -m "Mock 1"
    python clat_md_to_pdf.py claude.md -o mock2.pdf -m "Mock 2"
"""

from __future__ import annotations

import argparse
import re
import sys
from pathlib import Path
from xml.sax.saxutils import escape

from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import cm
from reportlab.platypus import HRFlowable, PageBreak, Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

# Reuse font registration from txt_to_pdf
sys.path.insert(0, str(Path(__file__).resolve().parent))
from txt_to_pdf import BASE_FONT, BOLD_FONT, LETTERS, LETTER_TO_IDX  # noqa: E402

CLAUDE_SECTION_RE = re.compile(
    r"^# SECTION [A-E] — (.+?)(?:\s*\(Q\d+.+)?\s*$", re.M
)
CLAUDE_Q_BLOCK_RE = re.compile(
    r"\*\*Q(\d+)\.\*\*\s*(.*?)"
    r"\(A\)\s*(.*?)\n"
    r"\(B\)\s*(.*?)\n"
    r"\(C\)\s*(.*?)\n"
    r"\(D\)\s*(.*?)\n"
    r"\*\*ANSWER:\s*([A-D])\*\*\s*\n"
    r"\*\*EXPLANATION:\*\*\s*(.*?)"
    r"(?=\n\*\*Q\d+\.|\n---|\n# SECTION |\Z)",
    re.S,
)

GEMINI_SECTION_RE = re.compile(
    r"Section [IVX]+:\s*([^(]+?)\s*\(Questions\s*(\d+)\s*[–-]\s*(\d+)\)",
    re.I,
)
GEMINI_QUESTION_RE = re.compile(
    r"(\d+)\.\s*(.*?)"
    r"\(A\)\s*(.*?)"
    r"\(B\)\s*(.*?)"
    r"\(C\)\s*(.*?)"
    r"\(D\)\s*(.*?)"
    r"Answer:\s*([A-D])\s*"
    r"Explanation:\s*(.*?)"
    r"(?=\d+\.\s|Section [IVX]+:|\Z)",
    re.S | re.I,
)


def clean_section_name(name: str) -> str:
    name = re.sub(r"\s+", " ", name.strip())
    name = name.replace(
        "Current Affairs including General Knowledge",
        "Current Affairs & General Knowledge",
    )
    if name.isupper():
        name = name.title()
        name = name.replace("Gk", "GK").replace("&", "&")
    return name


def strip_md_noise(text: str) -> str:
    text = re.sub(r"\*\*([^*]+)\*\*", r"\1", text)
    text = re.sub(r"\*([^*]+)\*", r"\1", text)
    return text.strip()


def parse_claude_md(text: str):
    start = text.find("# SECTION")
    if start >= 0:
        text = text[start:]

    sections = []
    parts = re.split(r"(?=^# SECTION )", text, flags=re.M)

    for part in parts:
        if not part.strip():
            continue
        header_m = CLAUDE_SECTION_RE.search(part)
        if not header_m:
            continue
        section_name = clean_section_name(header_m.group(1))

        questions = []
        q_positions = list(re.finditer(r"\*\*Q(\d+)\.\*\*", part))
        for i, qm in enumerate(q_positions):
            q_start = qm.start()
            q_end = q_positions[i + 1].start() if i + 1 < len(q_positions) else len(part)
            block = part[q_start:q_end]
            m = CLAUDE_Q_BLOCK_RE.search(block)
            if not m:
                continue

            context_start = part.rfind("\n---", 0, q_start)
            if context_start < 0:
                context_start = header_m.end()
            context_chunk = part[context_start:q_start]
            context_chunk = re.sub(r"^#+ .+$", "", context_chunk, flags=re.M)
            context_chunk = re.sub(r"^---\s*$", "", context_chunk, flags=re.M)
            context = strip_md_noise(context_chunk)

            stem = strip_md_noise(m.group(2))
            if context and context not in stem:
                stem = f"{context}\n\n{stem}" if len(context) > 40 else stem

            questions.append(
                {
                    "q": escape(stem),
                    "options": [
                        escape(strip_md_noise(m.group(3))),
                        escape(strip_md_noise(m.group(4))),
                        escape(strip_md_noise(m.group(5))),
                        escape(strip_md_noise(m.group(6))),
                    ],
                    "correct": LETTER_TO_IDX[m.group(7)],
                    "exp": escape(strip_md_noise(m.group(8))),
                }
            )

        if questions:
            sections.append((section_name, questions))

    return sections


def parse_gemini_md(text: str):
    text = text.replace("\u2013", "-").replace("\u2014", "-")
    sections = []
    section_spans = list(GEMINI_SECTION_RE.finditer(text))
    if not section_spans:
        return sections

    for i, sm in enumerate(section_spans):
        section_name = clean_section_name(sm.group(1))
        body_start = sm.end()
        body_end = section_spans[i + 1].start() if i + 1 < len(section_spans) else len(text)
        body = text[body_start:body_end]

        questions = []
        q_matches = list(GEMINI_QUESTION_RE.finditer(body))
        for j, qm in enumerate(q_matches):
            q_start = qm.start()
            context = ""
            if j == 0 or q_matches[j - 1].end() < q_start - 20:
                prefix = body[:q_start]
                prefix = re.sub(r"^Questions\s*", "", prefix, flags=re.I)
                prefix = re.sub(r"^Passage\s*\d+\s*", "", prefix, flags=re.I)
                context = strip_md_noise(prefix)

            stem = strip_md_noise(qm.group(2))
            if context and len(context) > 40 and context not in stem:
                stem = f"{context}\n\n{stem}"

            questions.append(
                {
                    "q": escape(stem),
                    "options": [
                        escape(strip_md_noise(qm.group(3))),
                        escape(strip_md_noise(qm.group(4))),
                        escape(strip_md_noise(qm.group(5))),
                        escape(strip_md_noise(qm.group(6))),
                    ],
                    "correct": LETTER_TO_IDX[qm.group(7).upper()],
                    "exp": escape(strip_md_noise(qm.group(8))),
                }
            )

        if questions:
            sections.append((section_name, questions))

    return sections


def detect_format(text: str) -> str:
    if "# SECTION" in text and "**ANSWER:" in text:
        return "claude"
    if re.search(r"Section [IVX]+:", text, re.I) and re.search(r"Answer:\s*[A-D]", text, re.I):
        return "gemini"
    return "claude"


def parse_clat_md(text: str):
    fmt = detect_format(text)
    if fmt == "gemini":
        return parse_gemini_md(text)
    return parse_claude_md(text)


def build_styles():
    styles = getSampleStyleSheet()
    s = {}
    s["title"] = ParagraphStyle(
        "TitleStyle",
        parent=styles["Title"],
        fontSize=20,
        fontName=BOLD_FONT,
        spaceAfter=4,
        textColor=colors.HexColor("#1a1a2e"),
        alignment=TA_CENTER,
    )
    s["subtitle"] = ParagraphStyle(
        "SubtitleStyle",
        parent=styles["Normal"],
        fontSize=11,
        fontName=BASE_FONT,
        alignment=TA_CENTER,
        textColor=colors.HexColor("#555555"),
        spaceAfter=2,
    )
    s["section"] = ParagraphStyle(
        "SectionStyle",
        fontSize=16,
        fontName=BOLD_FONT,
        textColor=colors.white,
        spaceBefore=0,
        spaceAfter=0,
        leading=20,
    )
    s["qnum"] = ParagraphStyle(
        "QNum",
        fontSize=11.5,
        fontName=BOLD_FONT,
        textColor=colors.HexColor("#1a1a2e"),
        spaceAfter=4,
    )
    s["question"] = ParagraphStyle(
        "Question",
        fontSize=11,
        fontName=BASE_FONT,
        leading=15,
        spaceAfter=8,
        textColor=colors.HexColor("#222222"),
    )
    s["option"] = ParagraphStyle(
        "Option",
        fontSize=10.5,
        fontName=BASE_FONT,
        leading=14,
        leftIndent=14,
        spaceAfter=3,
        textColor=colors.HexColor("#333333"),
    )
    s["option_correct"] = ParagraphStyle(
        "OptionCorrect",
        parent=s["option"],
        fontName=BOLD_FONT,
        textColor=colors.HexColor("#0a7a3d"),
        backColor=colors.HexColor("#e8f8ee"),
    )
    s["answer"] = ParagraphStyle(
        "Answer",
        fontSize=10.5,
        fontName=BOLD_FONT,
        leading=14,
        spaceBefore=6,
        spaceAfter=3,
        textColor=colors.HexColor("#0a7a3d"),
    )
    s["expl_label"] = ParagraphStyle(
        "ExplLabel",
        fontSize=10.5,
        fontName=BOLD_FONT,
        textColor=colors.HexColor("#1a1a2e"),
    )
    s["explanation"] = ParagraphStyle(
        "Explanation",
        fontSize=10,
        fontName=BASE_FONT,
        leading=14,
        textColor=colors.HexColor("#444444"),
        leftIndent=6,
        spaceAfter=2,
    )
    return s


def build_section_header(title, styles):
    t = Table([[Paragraph(escape(title), styles["section"])]], colWidths=[17 * cm])
    t.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, -1), colors.HexColor("#1a1a2e")),
                ("LEFTPADDING", (0, 0), (-1, -1), 12),
                ("TOPPADDING", (0, 0), (-1, -1), 8),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
                ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
            ]
        )
    )
    return t


def build_question_block(idx, item, styles):
    story = [
        Paragraph(f"Q{idx}.", styles["qnum"]),
        Paragraph(item["q"], styles["question"]),
    ]
    for i, opt in enumerate(item["options"]):
        label = LETTERS[i]
        text = f"({label})&nbsp;&nbsp;{opt}"
        if i == item["correct"]:
            story.append(Paragraph(text + "&nbsp;&nbsp;&#10003;", styles["option_correct"]))
        else:
            story.append(Paragraph(text, styles["option"]))
    story.append(
        Paragraph(f"Correct Answer: ({LETTERS[item['correct']]})", styles["answer"])
    )
    if item["exp"]:
        story.append(Paragraph("Explanation:", styles["expl_label"]))
        story.append(Paragraph(item["exp"], styles["explanation"]))
    story.append(Spacer(1, 10))
    story.append(
        HRFlowable(
            width="100%",
            thickness=0.5,
            color=colors.HexColor("#dddddd"),
            spaceBefore=2,
            spaceAfter=12,
        )
    )
    return story


def build_pdf(sections, output_path, mock_title):
    styles = build_styles()
    doc = SimpleDocTemplate(
        output_path,
        pagesize=A4,
        topMargin=1.6 * cm,
        bottomMargin=1.6 * cm,
        leftMargin=1.5 * cm,
        rightMargin=1.5 * cm,
    )
    story = [
        Paragraph(escape(mock_title), styles["title"]),
        Paragraph("Questions &bull; Answers &bull; Explanations", styles["subtitle"]),
        Spacer(1, 16),
    ]

    total_q = sum(len(qs) for _, qs in sections)
    summary_data = [["Section", "No. of Questions"]]
    for name, qs in sections:
        summary_data.append([name, str(len(qs))])
    summary_data.append(["Total", str(total_q)])

    summary_table = Table(summary_data, colWidths=[12 * cm, 5 * cm])
    summary_table.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#1a1a2e")),
                ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
                ("FONTNAME", (0, 0), (-1, 0), BOLD_FONT),
                ("FONTNAME", (0, 1), (-1, -1), BASE_FONT),
                ("FONTNAME", (0, -1), (-1, -1), BOLD_FONT),
                ("BACKGROUND", (0, -1), (-1, -1), colors.HexColor("#f0f0f5")),
                ("GRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#cccccc")),
                ("ALIGN", (1, 0), (-1, -1), "CENTER"),
                ("TOPPADDING", (0, 0), (-1, -1), 6),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
                ("FONTSIZE", (0, 0), (-1, -1), 10.5),
            ]
        )
    )
    story.append(summary_table)
    story.append(PageBreak())

    for name, qs in sections:
        story.append(build_section_header(name, styles))
        story.append(Spacer(1, 14))
        for i, item in enumerate(qs, start=1):
            story.extend(build_question_block(i, item, styles))
        story.append(PageBreak())

    if story and isinstance(story[-1], PageBreak):
        story.pop()

    doc.build(story)


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("input", type=Path, help="CLAT mock markdown file")
    parser.add_argument("-o", "--output", type=Path, required=True, help="Output PDF path")
    parser.add_argument("-m", "--mock", type=str, required=True, help='Mock label, e.g. "Mock 1"')
    args = parser.parse_args()

    if not args.input.exists():
        print(f"Error: {args.input} not found", file=sys.stderr)
        sys.exit(1)

    raw = args.input.read_text(encoding="utf-8")
    sections = parse_clat_md(raw)
    if not sections:
        print(f"Error: no questions parsed from {args.input}", file=sys.stderr)
        sys.exit(1)

    total = sum(len(qs) for _, qs in sections)
    for name, qs in sections:
        print(f"  {name}: {len(qs)} questions")

    args.output.parent.mkdir(parents=True, exist_ok=True)
    build_pdf(sections, str(args.output), args.mock)
    print(f"Wrote {total} questions to {args.output}")


if __name__ == "__main__":
    main()
