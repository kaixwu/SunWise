import sys
import subprocess

try:
    import pypdf
except ImportError:
    subprocess.check_call([sys.executable, "-m", "pip", "install", "pypdf"])
    import pypdf

files = [
    r"C:\Users\ASUS\Downloads\[FP] Project Document Template.docx.pdf",
    r"C:\Users\ASUS\Downloads\[FP] Sample Project Content.docx.pdf",
    r"C:\Users\ASUS\Downloads\[FP] Project Briefer.docx.pdf"
]

for f in files:
    try:
        reader = pypdf.PdfReader(f)
        text = ""
        for page in reader.pages:
            text += page.extract_text() + "\n"
        print(f"=== {f} ===")
        # Print first 4000 chars and ignore unicode errors
        safe_text = text[:4000].encode("ascii", "ignore").decode("ascii")
        print(safe_text)
        print("="*40)
    except Exception as e:
        print(f"Failed to read {f}: {e}")
