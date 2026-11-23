"""Wrap inspected slide renders in a fixed 16:9 viewer-only PDF."""
import sys
from pathlib import Path
from reportlab.pdfgen import canvas
from reportlab.lib.utils import ImageReader

source = Path(sys.argv[1])
target = Path(sys.argv[2])
slides = sorted(source.glob('slide-*.png'))
if len(slides) != 7:
    raise ValueError('Expected seven inspected slide renders')
pdf = canvas.Canvas(str(target), pagesize=(960, 540), pageCompression=1)
pdf.setTitle('해보기 2026 컴학 해커톤 발표')
pdf.setAuthor('해보기 팀')
for slide in slides:
    pdf.drawImage(ImageReader(str(slide)), 0, 0, width=960, height=540)
    pdf.showPage()
pdf.save()
