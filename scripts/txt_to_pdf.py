#!/usr/bin/env python3
"""
txt_to_pdf.py — Convert exam-question .txt files into a formatted PDF.

Expects each input .txt file to contain questions in this format
(the "[difficulty]" tag is optional):

    Question 1 [medium]
    Type: single
    Stem: What is the capital of France?
      A. Berlin
      B. Madrid
      C. Paris
      D. Rome
    Correct: C
    Explanation: Paris has been the capital of France since ...

Everything after a line starting with "Raw JSON" or a line of "===="
is ignored, so you can feed it the full raw generator output (including
the trailing JSON dump) without cleaning it up first.

Each input file becomes its own section in the output PDF, titled using
the first line of the file (or the filename if that fails).

USAGE
-----
    python txt_to_pdf.py chemistry.txt physics.txt maths.txt \
        -o exam_paper.pdf -t "JEE Advanced — Full Sample Paper"

    python txt_to_pdf.py gs_paper1.txt -o upsc.pdf -t "UPSC Prelims Paper I"

Requires: reportlab   (pip install reportlab --break-system-packages)
"""

import argparse
import re
import sys
from pathlib import Path
from xml.sax.saxutils import escape

from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_LEFT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import cm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import (HRFlowable, PageBreak, Paragraph,
                                 SimpleDocTemplate, Spacer, Table, TableStyle)

LETTERS = ["A", "B", "C", "D", "E", "F"]
LETTER_TO_IDX = {L: i for i, L in enumerate(LETTERS)}

# ---------------------------------------------------------------------------
# Unicode font registration (so symbols like √ π α → ⇌ Σ ∫ render correctly)
# ---------------------------------------------------------------------------

def register_fonts():
    candidates = [
        ("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
         "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"),
        ("C:/Windows/Fonts/arial.ttf", "C:/Windows/Fonts/arialbd.ttf"),
        ("C:/Windows/Fonts/segoeui.ttf", "C:/Windows/Fonts/segoeuib.ttf"),
    ]
    for regular, bold in candidates:
        if Path(regular).exists() and Path(bold).exists():
            pdfmetrics.registerFont(TTFont("Body", regular))
            pdfmetrics.registerFont(TTFont("Body-Bold", bold))
            return "Body", "Body-Bold"
    # Fallback to built-in fonts (no exotic unicode support, but always works)
    return "Helvetica", "Helvetica-Bold"


BASE_FONT, BOLD_FONT = register_fonts()

# ---------------------------------------------------------------------------
# Parsing
# ---------------------------------------------------------------------------

QUESTION_SPLIT_RE = re.compile(r'\n(?=Question\s+\d+\b)')
STEM_RE = re.compile(r'Stem:\s*(.+?)\n\s*A\.', re.S)
OPTION_RE = re.compile(r'^\s*([A-F])\.\s*(.+)$', re.M)
CORRECT_RE = re.compile(r'Correct:\s*([A-F])')
EXPLANATION_RE = re.compile(r'Explanation:\s*(.+)$', re.S)
DIFFICULTY_RE = re.compile(r'Question\s+\d+\s*\[(\w+)\]')


def strip_trailing_junk(text: str) -> str:
    """Cut off anything after a 'Raw JSON' marker or a long '====' divider
    that follows the last real question, so we don't try to parse JSON."""
    cut_points = []
    m = re.search(r'\n\s*Raw JSON', text)
    if m:
        cut_points.append(m.start())
    # A line of 20+ '=' characters that appears after at least one "Question"
    for m in re.finditer(r'\n=+\s*\n', text):
        if re.search(r'Question\s+\d+', text[:m.start()]):
            cut_points.append(m.start())
            break
    if cut_points:
        text = text[:min(cut_points)]
    return text


def parse_questions(text: str):
    text = strip_trailing_junk(text)
    blocks = QUESTION_SPLIT_RE.split(text.strip())
    questions = []
    for block in blocks:
        if not re.match(r'Question\s+\d+\b', block):
            continue
        stem_m = STEM_RE.search(block)
        correct_m = CORRECT_RE.search(block)
        if not stem_m or not correct_m:
            continue  # skip malformed / incomplete blocks
        stem = stem_m.group(1).strip()
        options = [opt.strip() for _, opt in OPTION_RE.findall(block)]
        correct_idx = LETTER_TO_IDX[correct_m.group(1)]
        exp_m = EXPLANATION_RE.search(block)
        explanation = exp_m.group(1).strip() if exp_m else ""
        diff_m = DIFFICULTY_RE.search(block)
        difficulty = diff_m.group(1) if diff_m else None
        questions.append({
            "q": escape(stem),
            "options": [escape(o) for o in options],
            "correct": correct_idx,
            "exp": escape(explanation),
            "difficulty": difficulty,
        })
    return questions


def derive_section_title(file_path: Path, raw_text: str) -> str:
    first_line = raw_text.strip().splitlines()[0].strip() if raw_text.strip() else ""
    # If the file starts directly with a question (no descriptive header line),
    # fall back to the filename instead of using the question text as a title.
    looks_like_question = bool(re.match(r'Question\s+\d+\b', first_line))
    if first_line and len(first_line) < 120 and not looks_like_question:
        # e.g. "JEE Mains Full Paper — Chemistry" -> "Chemistry"
        parts = re.split(r'\s+—\s+|\s+-\s+', first_line)
        if len(parts) > 1:
            return parts[-1].strip()
        return first_line
    return file_path.stem.replace("_", " ").title()


# ---------------------------------------------------------------------------
# PDF styling
# ---------------------------------------------------------------------------

def build_styles():
    styles = getSampleStyleSheet()
    s = {}
    s["title"] = ParagraphStyle('TitleStyle', parent=styles['Title'], fontSize=20,
                                 fontName=BOLD_FONT, spaceAfter=4,
                                 textColor=colors.HexColor("#1a1a2e"))
    s["subtitle"] = ParagraphStyle('SubtitleStyle', parent=styles['Normal'], fontSize=11,
                                    fontName=BASE_FONT, alignment=TA_CENTER,
                                    textColor=colors.HexColor("#555555"), spaceAfter=2)
    s["section"] = ParagraphStyle('SectionStyle', fontSize=16, fontName=BOLD_FONT,
                                   textColor=colors.white, spaceBefore=0, spaceAfter=0,
                                   alignment=TA_LEFT, leading=20)
    s["qnum"] = ParagraphStyle('QNum', fontSize=11.5, fontName=BOLD_FONT,
                                textColor=colors.HexColor("#1a1a2e"), spaceAfter=4)
    s["question"] = ParagraphStyle('Question', fontSize=11, fontName=BASE_FONT, leading=15,
                                    spaceAfter=8, textColor=colors.HexColor("#222222"))
    s["option"] = ParagraphStyle('Option', fontSize=10.5, fontName=BASE_FONT, leading=14,
                                  leftIndent=14, spaceAfter=3,
                                  textColor=colors.HexColor("#333333"))
    s["option_correct"] = ParagraphStyle('OptionCorrect', parent=s["option"],
                                          fontName=BOLD_FONT,
                                          textColor=colors.HexColor("#0a7a3d"),
                                          backColor=colors.HexColor("#e8f8ee"))
    s["answer"] = ParagraphStyle('Answer', fontSize=10.5, fontName=BOLD_FONT, leading=14,
                                  spaceBefore=6, spaceAfter=3,
                                  textColor=colors.HexColor("#0a7a3d"))
    s["expl_label"] = ParagraphStyle('ExplLabel', fontSize=10.5, fontName=BOLD_FONT,
                                      textColor=colors.HexColor("#1a1a2e"))
    s["explanation"] = ParagraphStyle('Explanation', fontSize=10, fontName=BASE_FONT,
                                       leading=14, textColor=colors.HexColor("#444444"),
                                       leftIndent=6, spaceAfter=2)
    return s


def build_section_header(title, styles):
    t = Table([[Paragraph(escape(title), styles["section"])]], colWidths=[17 * cm])
    t.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, -1), colors.HexColor("#1a1a2e")),
        ('LEFTPADDING', (0, 0), (-1, -1), 12),
        ('TOPPADDING', (0, 0), (-1, -1), 8),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 8),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
    ]))
    return t


def build_question_block(idx, item, styles):
    story = [Paragraph(f"Q{idx}.", styles["qnum"]),
             Paragraph(item["q"], styles["question"])]
    for i, opt in enumerate(item["options"]):
        label = LETTERS[i]
        text = f"({label})&nbsp;&nbsp;{opt}"
        if i == item["correct"]:
            story.append(Paragraph(text + "&nbsp;&nbsp;&#10003;", styles["option_correct"]))
        else:
            story.append(Paragraph(text, styles["option"]))
    story.append(Paragraph(f"Correct Answer: ({LETTERS[item['correct']]})", styles["answer"]))
    if item["exp"]:
        story.append(Paragraph("Explanation:", styles["expl_label"]))
        story.append(Paragraph(item["exp"], styles["explanation"]))
    story.append(Spacer(1, 10))
    story.append(HRFlowable(width="100%", thickness=0.5, color=colors.HexColor("#dddddd"),
                             spaceBefore=2, spaceAfter=12))
    return story


# ---------------------------------------------------------------------------
# Main build
# ---------------------------------------------------------------------------

def build_pdf(sections, output_path, title, subtitle):
    styles = build_styles()
    doc = SimpleDocTemplate(output_path, pagesize=A4,
                             topMargin=1.6 * cm, bottomMargin=1.6 * cm,
                             leftMargin=1.5 * cm, rightMargin=1.5 * cm)
    story = [Paragraph(escape(title), styles["title"])]
    if subtitle:
        story.append(Paragraph(escape(subtitle), styles["subtitle"]))
    story.append(Paragraph("Single Correct Answer MCQs &bull; With Explanations",
                            styles["subtitle"]))
    story.append(Spacer(1, 16))

    total_q = sum(len(qs) for _, qs in sections)
    summary_data = [["Section", "No. of Questions", "Question Type"]]
    for name, qs in sections:
        summary_data.append([name, str(len(qs)), "Single Correct MCQ"])
    summary_data.append(["Total", str(total_q), ""])

    summary_table = Table(summary_data, colWidths=[7 * cm, 5 * cm, 5 * cm])
    summary_table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor("#1a1a2e")),
        ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
        ('FONTNAME', (0, 0), (-1, 0), BOLD_FONT),
        ('FONTNAME', (0, 1), (-1, -1), BASE_FONT),
        ('FONTNAME', (0, -1), (-1, -1), BOLD_FONT),
        ('BACKGROUND', (0, -1), (-1, -1), colors.HexColor("#f0f0f5")),
        ('GRID', (0, 0), (-1, -1), 0.5, colors.HexColor("#cccccc")),
        ('ALIGN', (1, 0), (-1, -1), 'CENTER'),
        ('TOPPADDING', (0, 0), (-1, -1), 6),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 6),
        ('FONTSIZE', (0, 0), (-1, -1), 10.5),
    ]))
    story.append(summary_table)
    story.append(PageBreak())

    for name, qs in sections:
        story.append(build_section_header(name, styles))
        story.append(Spacer(1, 14))
        for i, item in enumerate(qs, start=1):
            story.extend(build_question_block(i, item, styles))
        story.append(PageBreak())

    # Drop trailing page break flowable if present (avoids a blank last page)
    if story and isinstance(story[-1], PageBreak):
        story.pop()

    doc.build(story)


def main():
    parser = argparse.ArgumentParser(description=__doc__,
                                      formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("inputs", nargs="+", type=Path,
                         help="One or more .txt files; each becomes a section.")
    parser.add_argument("-o", "--output", type=Path, default=Path("question_paper.pdf"),
                         help="Output PDF path (default: question_paper.pdf)")
    parser.add_argument("-t", "--title", type=str, default="Sample Question Paper",
                         help="Main title printed at the top of the PDF")
    parser.add_argument("-s", "--subtitle", type=str, default=None,
                         help="Optional subtitle line (defaults to section names joined by bullets)")
    args = parser.parse_args()

    sections = []
    for path in args.inputs:
        if not path.exists():
            print(f"Warning: {path} not found, skipping.", file=sys.stderr)
            continue
        raw_text = path.read_text(encoding="utf-8")
        title = derive_section_title(path, raw_text)
        qs = parse_questions(raw_text)
        if not qs:
            print(f"Warning: no questions parsed from {path}, skipping.", file=sys.stderr)
            continue
        sections.append((title, qs))
        print(f"Parsed {len(qs)} questions from {path.name} -> section '{title}'")

    if not sections:
        print("No questions parsed from any input file. Nothing to build.", file=sys.stderr)
        sys.exit(1)

    subtitle = args.subtitle or " \u2022 ".join(name for name, _ in sections)
    build_pdf(sections, str(args.output), args.title, subtitle)
    total = sum(len(qs) for _, qs in sections)
    print(f"Done. Wrote {total} questions across {len(sections)} section(s) to {args.output}")


if __name__ == "__main__":
    main()
