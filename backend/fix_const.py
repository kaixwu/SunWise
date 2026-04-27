import os, glob

files = glob.glob("c:/Users/ASUS/Documents/college/bsit 3-2/adet/SunWise/frontend/src/**/*.jsx", recursive=True)

CORRECT = 'const API = import.meta.env.VITE_API_URL || "http://localhost:5000"'

for f in files:
    with open(f, 'r', encoding='utf-8') as fh:
        content = fh.read()

    # Fix the broken self-reference
    if 'const API = API' in content:
        content = content.replace('const API = API;', CORRECT + ';')
        content = content.replace('const API = API\n', CORRECT + '\n')
        with open(f, 'w', encoding='utf-8') as fh:
            fh.write(content)
        print(f"Fixed: {os.path.basename(f)}")

print("Done!")
