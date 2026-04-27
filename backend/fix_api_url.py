import os, glob, re

files = glob.glob("c:/Users/ASUS/Documents/college/bsit 3-2/adet/SunWise/frontend/src/**/*.jsx", recursive=True)

API_CONST = 'const API = import.meta.env.VITE_API_URL || "http://localhost:5000"'

for f in files:
    with open(f, 'r', encoding='utf-8') as fh:
        content = fh.read()
    
    if 'http://localhost:5000' not in content:
        continue

    # If already has the API const, just replace the URLs
    if 'VITE_API_URL' in content:
        new_content = content.replace('http://localhost:5000', '${API}')
    else:
        # Add the const after the last import statement and replace URLs
        # First add a const declaration at the module level
        new_content = re.sub(
            r'((?:^import .*\n)+)',
            r'\1\n' + API_CONST + '\n',
            content,
            count=1,
            flags=re.MULTILINE
        )
        new_content = new_content.replace('`http://localhost:5000', '`${API}')
        new_content = new_content.replace('"http://localhost:5000"', 'API')

    with open(f, 'w', encoding='utf-8') as fh:
        fh.write(new_content)

    print(f"Updated: {os.path.basename(f)}")

print("Done!")
