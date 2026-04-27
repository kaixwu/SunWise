import glob, re

files = glob.glob('c:/Users/ASUS/Documents/college/bsit 3-2/adet/SunWise/frontend/src/**/*.jsx', recursive=True)
CORRECT = 'const API = import.meta.env.VITE_API_URL || "http://localhost:5000"'

for f in files:
    with open(f, 'r', encoding='utf-8') as fh:
        content = fh.read()

    original = content

    # Remove all const API = ... lines
    lines = content.split('\n')
    cleaned = [l for l in lines if not l.strip().startswith('const API =')]

    # Find last import line index
    last_import = -1
    for i, l in enumerate(cleaned):
        if l.strip().startswith('import '):
            last_import = i

    # Insert single correct const API after last import
    if last_import >= 0:
        cleaned.insert(last_import + 1, CORRECT)
    
    content = '\n'.join(cleaned)

    # Replace ALL remaining hardcoded localhost:5000 strings (in template literals and strings)
    content = content.replace('"http://localhost:5000"', 'API')
    content = content.replace('`http://localhost:5000', '`${API}')
    content = content.replace("'http://localhost:5000'", 'API')

    if content != original:
        with open(f, 'w', encoding='utf-8') as fh:
            fh.write(content)
        print(f'Fixed: {f.split("/")[-1]}')

print('Done!')
